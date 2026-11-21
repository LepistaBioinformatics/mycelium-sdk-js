import type { NextFunction, Request, RequestHandler, Response } from "express"
import { ProfileDecodingError } from "../errors.js"
import {
  decodeAndDecompressProfileFromBase64,
} from "../functions/decodeAndDecompressProfileFromBase64.js"
import type { Profile } from "../models/profile.js"
import type { JwksProfileSignatureVerifier } from "../jwks/jwksProfileSignatureVerifier.js"
import {
  SIGNATURE_INTERNAL_DETAIL,
  sharedProfileSignatureVerifier,
  verifyRequestProfile,
  warnWhenSignatureIsIgnored,
  type SignatureRejectionListener,
} from "../profileSignatureEnforcement.js"
import { DEFAULT_PROFILE_KEY } from "../settings.js"

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      profile?: Profile
    }
  }
}

export interface ProfileSignatureOptions {
  /**
   * Pre-built verifier. Defaults to `MYCELIUM_JWKS_URL` (and the related
   * variables) from `process.env`, read when the middleware is created; the
   * resulting verifier is built once per process and shared by every
   * middleware and by the Fastify plugin (one key cache). The gateway keys
   * are fetched on the first signed request (requests fail closed until they
   * are available). Invalid configuration throws here, so the application
   * fails to start. Pass
   * `await prepareProfileSignatureVerifier()` to download the keys at startup.
   */
  signatureVerifier?: JwksProfileSignatureVerifier
  /** Receives the log-safe reason of each rejected signature. */
  onSignatureRejected?: SignatureRejectionListener
}

export interface ProfileMiddlewareOptions extends ProfileSignatureOptions {
  environment?: string
}

function resolveVerifier(
  opts: ProfileSignatureOptions
): JwksProfileSignatureVerifier | undefined {
  return opts.signatureVerifier ?? sharedProfileSignatureVerifier()
}

/**
 * Verification enabled: the profile is only exposed, and `next` only called,
 * after the signature is accepted. Failures answer 403/500 in every
 * environment; the development leniency never applies.
 */
function signatureEnforcingHandler(
  verifier: JwksProfileSignatureVerifier,
  onRejected?: SignatureRejectionListener
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    verifyRequestProfile(req, verifier, onRejected)
      .then((outcome) => {
        if (!outcome.ok) {
          res.status(outcome.status).json({ detail: outcome.detail })
          return
        }
        req.profile = outcome.profile
        next()
      })
      .catch(() => {
        if (!res.headersSent) {
          res.status(500).json({ detail: SIGNATURE_INTERNAL_DETAIL })
        }
      })
  }
}

function resolveEnvironment(opts?: ProfileMiddlewareOptions): string {
  return opts?.environment ?? process.env.NODE_ENV ?? "development"
}

function extractHeaderValue(req: Request): string | undefined {
  const value = req.headers[DEFAULT_PROFILE_KEY]
  if (Array.isArray(value)) return value[0]
  return value
}

export function profileMiddleware(
  opts: ProfileMiddlewareOptions = {}
): RequestHandler {
  const verifier = resolveVerifier(opts)
  if (verifier !== undefined) {
    return signatureEnforcingHandler(verifier, opts.onSignatureRejected)
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    warnWhenSignatureIsIgnored(req)
    try {
      const isDev = resolveEnvironment(opts) === "development"
      const headerValue = extractHeaderValue(req)

      if (headerValue === undefined) {
        if (isDev) {
          req.profile = undefined
          next()
          return
        }
        res.status(403).json({
          detail: `Required header '${DEFAULT_PROFILE_KEY}' missing in production environment.`,
        })
        return
      }

      try {
        req.profile = decodeAndDecompressProfileFromBase64(headerValue)
        next()
      } catch (_error) {
        if (isDev) {
          req.profile = undefined
          next()
          return
        }
        res.status(401).json({
          detail: "Unable to check user identity. Please contact administrators",
        })
      }
    } catch (error) {
      res.status(500).json({
        detail: `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }
}

export function getProfileFromHeaderRequired(
  opts: ProfileSignatureOptions = {}
): RequestHandler {
  const verifier = resolveVerifier(opts)
  if (verifier !== undefined) {
    return signatureEnforcingHandler(verifier, opts.onSignatureRejected)
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    warnWhenSignatureIsIgnored(req)
    try {
      const headerValue = extractHeaderValue(req)
      if (headerValue === undefined) {
        throw new ProfileDecodingError(
          `Required header '${DEFAULT_PROFILE_KEY}' missing`
        )
      }
      req.profile = decodeAndDecompressProfileFromBase64(headerValue)
      next()
    } catch (error) {
      if (error instanceof ProfileDecodingError) {
        res.status(401).json({
          detail: "Unable to check user identity. Please contact administrators",
        })
        return
      }
      res.status(500).json({
        detail: `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }
}
