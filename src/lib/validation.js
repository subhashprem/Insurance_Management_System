// CNIC Validation
// Auto format: XXXXX-XXXXXXX-X, only digits allowed.
export function formatCNIC(val) {
  let digits = val.replace(/\D/g, '').slice(0, 13);
  let formatted = '';
  if (digits.length > 0) {
    formatted += digits.slice(0, 5);
  }
  if (digits.length > 5) {
    formatted += '-' + digits.slice(5, 12);
  }
  if (digits.length > 12) {
    formatted += '-' + digits.slice(12, 13);
  }
  return formatted;
}

export function validateCNIC(val) {
  const digits = val.replace(/\D/g, '');
  if (digits.length !== 13) {
    return 'CNIC must contain exactly 13 digits.';
  }
  if (!/^\d{5}-\d{7}-\d{1}$/.test(val)) {
    return 'CNIC must contain exactly 13 digits.';
  }
  return null;
}

// Phone Number Validation
// Minimum length = 11, Maximum length = 12 digits, no "+", no spaces, no alphabets
export function formatPhone(val) {
  return val.replace(/\D/g, '').slice(0, 12);
}

export function validatePhone(val) {
  if (!val) return null; // optional
  const digits = val.replace(/\D/g, '');
  if (val.includes('+') || val.includes(' ') || /\D/.test(val)) {
    return 'Phone number must contain only digits and be between 11 and 12 digits.';
  }
  if (digits.length < 11 || digits.length > 12) {
    return 'Phone number must contain only digits and be between 11 and 12 digits.';
  }
  return null;
}

// Date Validation
// DD/MM/YYYY auto formatting while typing. No alphabets.
export function formatDateInput(val) {
  let digits = val.replace(/\D/g, '').slice(0, 8);
  let formatted = '';
  if (digits.length > 0) {
    formatted += digits.slice(0, 2);
  }
  if (digits.length > 2) {
    formatted += '/' + digits.slice(2, 4);
  }
  if (digits.length > 4) {
    formatted += '/' + digits.slice(4, 8);
  }
  return formatted;
}

export function toDbDate(displayDate) {
  if (!displayDate) return '';
  const parts = displayDate.split('/');
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return displayDate;
}

export function toDisplayDate(dbDate) {
  if (!dbDate) return '';
  const parts = dbDate.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dbDate;
}

export function validateDate(val) {
  if (!val) return null;
  const dbDate = toDbDate(val);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dbDate) || isNaN(Date.parse(dbDate))) {
    return 'Please enter a valid date in DD/MM/YYYY format.';
  }
  return null;
}

export function validateDOBAge(val) {
  if (!val) return null;
  const err = validateDate(val);
  if (err) return err;

  const dbDate = toDbDate(val);
  const birth = new Date(dbDate);
  const today = new Date();
  if (birth > today) {
    return 'Date of birth cannot be in the future.';
  }
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  if (age < 0 || age > 120) {
    return 'Age must be between 0 and 120.';
  }
  return null;
}

// Name Validation
// Allow alphabets, spaces, dot (.), hyphen (-). Block numbers / special chars.
export function formatName(val) {
  return val.replace(/[^A-Za-z\s.\-]/g, '');
}

export function validateName(val) {
  if (!val || !val.trim()) return 'Required';
  if (!/^[A-Za-z\s.\-]+$/.test(val)) {
    return 'Only letters, spaces, dots, and hyphens are allowed.';
  }
  return null;
}

// Code Validation
// Allow uppercase letters, numbers, hyphen (-), underscore (_).
export function formatCode(val) {
  return val.toUpperCase().replace(/[^A-Z0-9\-_]/g, '');
}

export function validateCode(val) {
  if (!val || !val.trim()) return 'Required';
  if (!/^[A-Z0-9\-_]+$/.test(val)) {
    return 'Only uppercase letters, numbers, hyphens, and underscores are allowed.';
  }
  return null;
}

// Premium / Amount Validation
// Allow positive integers/decimals, max 2 decimals, only one dot, no commas/alphabets
export function formatAmount(val) {
  let clean = val.replace(/[^0-9.]/g, '');
  const dotIndex = clean.indexOf('.');
  if (dotIndex !== -1) {
    const before = clean.substring(0, dotIndex);
    const after = clean.substring(dotIndex + 1).replace(/\./g, '').slice(0, 2);
    clean = before + '.' + after;
  }
  return clean;
}

export function validateAmount(val) {
  if (val === undefined || val === null || val === '') return 'Required';
  const numStr = String(val);
  if (!/^\d+(\.\d{1,2})?$/.test(numStr)) {
    return 'Please enter a valid positive amount. Decimals up to 2 places are allowed.';
  }
  const num = parseFloat(numStr);
  if (isNaN(num) || num < 0) {
    return 'Please enter a valid positive amount. Decimals up to 2 places are allowed.';
  }
  return null;
}

// Trim Spaces
// Trim leading/trailing and remove duplicate spaces
export function trimSpaces(val) {
  if (!val) return '';
  return String(val).trim().replace(/\s+/g, ' ');
}
