import type { FastifyPluginAsync, FastifyRequest } from "fastify"
import fp from "fastify-plugin"
import {
  decodeAndDecompressProfileFromBase64,
} from "../functions/decodeAndDecompressProfileFromBase64.js"
import type { Profile } from "../models/profile.js"
import { DEFAULT_PROFILE_KEY } from "../settings.js"

declare module "fastify" {
  interface FastifyRequest {
    profile?: Profile
  }
}

export interface FastifyProfilePluginOptions {
  environment?: string
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
