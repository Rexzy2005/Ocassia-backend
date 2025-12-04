const cloudinary = require("cloudinary").v2;

// Configure Cloudinary
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/**
 * Upload file buffer to Cloudinary
 * Supports images and videos
 * @param {Buffer} fileBuffer - File buffer to upload
 * @param {string} filename - Original filename (used for public_id)
 * @param {string} mimetype - MIME type of the file
 * @returns {Promise<string>} Cloudinary URL
 */
async function uploadBuffer(fileBuffer, filename, mimetype) {
  if (!cloudinary.config().cloud_name) {
    throw new Error("Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET");
  }

  // Determine resource type (image, video, or auto)
  let resourceType = "auto";
  if (mimetype.startsWith("image/")) resourceType = "image";
  if (mimetype.startsWith("video/")) resourceType = "video";

  // Generate public_id from filename
  const publicId = `services/${Date.now()}-${filename.replace(/\.[^.]+$/, "")}`;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: resourceType,
        folder: "ocassia/services",
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.secure_url);
        }
      }
    );

    // Write buffer to stream
    uploadStream.end(fileBuffer);
  });
}

/**
 * Delete file from Cloudinary by URL
 * @param {string} url - Cloudinary URL or public_id
 * @returns {Promise<void>}
 */
async function deleteFileByUrl(url) {
  if (!url || !cloudinary.config().cloud_name) return;

  try {
    // Extract public_id from Cloudinary URL
    // URL format: https://res.cloudinary.com/{cloud_name}/image/upload/{public_id}.{ext}
    let publicId = url;

    if (url.includes("cloudinary.com")) {
      // Parse from URL
      const match = url.match(/upload\/(?:v\d+\/)?([^.]+)/);
      if (match) {
        publicId = match[1];
      }
    }

    if (publicId) {
      await cloudinary.uploader.destroy(publicId);
    }
  } catch (e) {
    console.warn("Cloudinary delete failed:", e.message || e);
    // Fail silently to not break the delete flow
  }
}

module.exports = { uploadBuffer, deleteFileByUrl };
