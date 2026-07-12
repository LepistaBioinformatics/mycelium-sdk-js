import type { NextFunction, Request, RequestHandler, Response } from "express"
import { ProfileDecodingError } from "../errors.js"
import {
  decodeAndDecompressProfileFromBase64,
} from "../functions/decodeAndDecompressProfileFromBase64.js"
import type { Profile } from "../models/profile.js"
import { DEFAULT_PROFILE_KEY } from "../settings.js"

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      profile?: Profile
    }
  }
}

export interface ProfileMiddlewareOptions {
  environment?: string
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
  return (req: Request, res: Response, next: NextFunction): void => {
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

export function getProfileFromHeaderRequired(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
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
