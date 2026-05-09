import xlsx from 'xlsx';

/**
 * Parse an Excel file buffer and return an array of objects
 * @param {Buffer} buffer - Excel file buffer
 * @returns {Array} Array of objects representing the rows
 */
export const parseExcel = (buffer) => {
  const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(worksheet);
};
