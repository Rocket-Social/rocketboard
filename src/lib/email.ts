// Reject trailing commas, surrounding angle brackets, quoted display names, and
// other "extra text" the user may have pasted along with the email — the toast
// copy promises these will be flagged.
const EMAIL_REGEX = /^[^\s@,;<>()[\]'"]+@[^\s@,;<>()[\]'"]+\.[^\s@,;<>()[\]'"]+$/

export function isEmailFormat(value: string): boolean {
  return EMAIL_REGEX.test(value.trim())
}
