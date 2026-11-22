import { z } from "zod"
import {
  LicensedResourceSchema,
  type LicensedResource,
} from "./licensedResource.js"

/**
 * A grant the subject holds on a peer instance. `issuer` is the id of the
 * peer instance that asserted it; the remaining members are those of a
 * `LicensedResource`.
 */
export const FederatedResourceSchema = LicensedResourceSchema.extend({
  issuer: z.string().uuid(),
})

export type FederatedResource = z.infer<typeof FederatedResourceSchema>

export const FederatedResourcesSchema = z.array(FederatedResourceSchema)

export type FederatedResources = z.infer<typeof FederatedResourcesSchema>

export function toGrant(resource: FederatedResource): LicensedResource {
  const { issuer: _issuer, ...grant } = resource
  return grant
}
