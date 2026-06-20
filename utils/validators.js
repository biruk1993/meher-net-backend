// Validation helper functions

function validateAdminId(id) {
  if (!id) return { valid: false, message: 'ID is required' };
  if (typeof id !== 'string') return { valid: false, message: 'ID must be a string' };
  if (id.length !== 8) return { valid: false, message: 'ID must be exactly 8 digits' };
  if (!/^\d{8}$/.test(id)) return { valid: false, message: 'ID must contain only numbers' };
  return { valid: true };
}

function validatePassword(password) {
  if (!password) return { valid: false, message: 'Password is required' };
  if (password.length < 6) return { valid: false, message: 'Password must be at least 6 characters' };
  return { valid: true };
}

function validatePhoneNumber(phone) {
  if (!phone) return { valid: false, message: 'Phone number is required' };
  if (!/^[0-9]{10,13}$/.test(phone)) return { valid: false, message: 'Phone number must be 10-13 digits' };
  return { valid: true };
}

function validateFullName(name) {
  if (!name) return { valid: false, message: 'Full name is required' };
  if (name.trim().length < 2) return { valid: false, message: 'Name must be at least 2 characters' };
  return { valid: true };
}

function validateUnitDepartment(unit) {
  if (!unit) return { valid: false, message: 'Unit/Department is required' };
  if (unit.trim().length < 2) return { valid: false, message: 'Unit/Department must be at least 2 characters' };
  return { valid: true };
}

function validateRegistrationData(data) {
  const { id, fullName, phoneNumber, unitDepartment, password } = data;

  const idCheck = validateAdminId(id);
  if (!idCheck.valid) return idCheck;

  const nameCheck = validateFullName(fullName);
  if (!nameCheck.valid) return nameCheck;

  const phoneCheck = validatePhoneNumber(phoneNumber);
  if (!phoneCheck.valid) return phoneCheck;

  const unitCheck = validateUnitDepartment(unitDepartment);
  if (!unitCheck.valid) return unitCheck;

  const passwordCheck = validatePassword(password);
  if (!passwordCheck.valid) return passwordCheck;

  return { valid: true };
}

function validateLoginData(data) {
  const { id, password } = data;

  const idCheck = validateAdminId(id);
  if (!idCheck.valid) return idCheck;

  const passwordCheck = validatePassword(password);
  if (!passwordCheck.valid) return passwordCheck;

  return { valid: true };
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
}

module.exports = {
  validateAdminId,
  validatePassword,
  validatePhoneNumber,
  validateFullName,
  validateUnitDepartment,
  validateRegistrationData,
  validateLoginData,
  sanitizeInput
};