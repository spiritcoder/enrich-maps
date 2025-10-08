const sanitizeFilename = (name) => {
  if (!name) return 'project';
  
  return name
    .replace(/[/\\:*?"<>|]/g, '') // Remove invalid characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, '') // Remove leading/trailing underscores
    .substring(0, 50) // Limit length
    .toLowerCase();
};

module.exports = { sanitizeFilename };