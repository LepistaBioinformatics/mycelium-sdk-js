import type { FastifyPluginAsync, FastifyRequest } from "fastify"
import fp from "fastify-plugin"
import {
  decodeAndDecompressProfileFromBase64,
} from "../functions/decodeAndDecompressProfileFromBase64.js"
import type { Profile } from "../models/profile.js"
import {
  loadProfileSignatureVerifierFromEnv,
  type ProfileSignatureVerifier,
} from "../profileSignatureConfig.js"
import {
  verifyRequestProfile,
  type SignatureRejectionListener,
} from "../profileSignatureEnforcement.js"
import { DEFAULT_PROFILE_KEY } from "../settings.js"

declare module "fastify" {
  interface FastifyRequest {
    profile?: Profile
  }
}

export interface FastifyProfilePluginOptions {
  environment?: string
  /**
   * Pre-built verifier. Defaults to `MYC_PROFILE_PUBLIC_KEY_*` from
   * `process.env`, read once at registration. Invalid configuration fails
   * the registration, so the server does not start.
   */
  signatureVerifier?: ProfileSignatureVerifier
  /** Receives the log-safe reason of each rejected signature. */
  onSignatureRejected?: SignatureRejectionListener
}

function resolveEnvironment(opts?: FastifyProfilePluginOptions): string {
  return opts?.environment ?? process.env.NODE_ENV ?? "development"
}

function extractHeaderValue(req: FastifyRequest): string | undefined {
  const value = req.headers[DEFAULT_PROFILE_KEY]
  if (Array.isArray(value)) return value[0]
  return value
}

const fastifyProfilePluginImpl: FastifyPluginAsync<
  FastifyProfilePluginOptions
> = async (fastify, opts) => {
  fastify.decorateRequest("profile", undefined)

  const verifier =
    opts.signatureVerifier ?? loadProfileSignatureVerifierFromEnv()

  if (verifier !== undefined) {
    // Verification enabled: reply 403/500 in every environment and never
    // reach the route handler without an accepted signature.
    fastify.addHook("onRequest", async (request, reply) => {
      const outcome = await verifyRequestProfile(
        request.raw,
        verifier,
        opts.onSignatureRejected
      )
      if (!outcome.ok) {
        return reply.status(outcome.status).send({ detail: outcome.detail })
      }
      request.profile = outcome.profile
    })
    return
  }

  fastify.addHook("onRequest", async (request, reply) => {
    try {
      const isDev = resolveEnvironment(opts) === "development"
      const headerValue = extractHeaderValue(request)

      if (headerValue === undefined) {
        if (isDev) {
          request.profile = undefined
          return
        }
        await reply.status(403).send({
          detail: `Required header '${DEFAULT_PROFILE_KEY}' missing in production environment.`,
        })
        return
      }

      try {
        request.profile = decodeAndDecompressProfileFromBase64(headerValue)
      } catch (_error) {
        if (isDev) {
          request.profile = undefined
          return
        }
        await reply.status(401).send({
          detail:
            "Unable to check user identity. Please contact administrators",
        })
      }
    } catch (error) {
      await reply.status(500).send({
        detail: `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  })
}

export const fastifyProfilePlugin = fp(fastifyProfilePluginImpl, {
  name: "mycelium-profile-plugin",
})
