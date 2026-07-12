export class MyceliumError extends Error {
  code?: string
  expTrue: boolean

  constructor(message: string, code?: string, expTrue = false) {
    super(message)
    this.name = "MyceliumError"
    this.code = code
    this.expTrue = expTrue
  }
}

export class InsufficientPrivilegesError extends MyceliumError {
  filteringState: string[]

  constructor(message: string, filteringState: string[] = []) {
    super(message, "MYC00019", true)
    this.name = "InsufficientPrivilegesError"
    this.filteringState = filteringState
  }
}

export class InsufficientLicensesError extends MyceliumError {
  constructor(
    message: string = "Insufficient licenses to perform these action"
  ) {
    super(message, "MYC00019", true)
    this.name = "InsufficientLicensesError"
  }
}

export class ProfileDecodingError extends MyceliumError {
  constructor(message: string) {
    super(message, "MYC00020", false)
    this.name = "ProfileDecodingError"
  }
}
