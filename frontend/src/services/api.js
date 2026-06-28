import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

/**
 * Upload CSV files to the backend.
 * All files are processed in the background. Returns job_ids for polling.
 *
 * @param {File[]} files - Array of File objects to upload
 * @param {Function} onUploadProgress - Callback for HTTP upload % (bytes sent)
 * @returns {Object} Response data with jobs array
 */
export const uploadCSV = async (files, onUploadProgress) => {
  const formData = new FormData();
  
  if (files instanceof FileList || Array.isArray(files)) {
    Array.from(files).forEach((file) => {
      formData.append("files", file);
    });
  } else {
    formData.append("files", files);
  }
  
  const response = await api.post("/upload-csv", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    // Disable default timeout for large file uploads
    timeout: 0,
    onUploadProgress: (progressEvent) => {
      if (onUploadProgress && progressEvent.total) {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        onUploadProgress(percentCompleted);
      }
    },
  });
  return response.data;
};

/**
 * Poll a single job's status.
 * Frontend calls this every 4 seconds for each active job.
 *
 * @param {string} jobId - The job UUID returned by upload-csv
 * @returns {Object} Job status data
 */
export const pollJobStatus = async (jobId) => {
  const response = await api.get(`/jobs/${jobId}`);
  return response.data;
};

/**
 * Fetch all recent jobs (last 30 minutes).
 * Called on page load to recover in-progress or recently completed uploads.
 *
 * @returns {Object} { jobs: [...] }
 */
export const fetchAllJobs = async () => {
  const response = await api.get("/jobs");
  return response.data;
};

export const verifyProduct = async ({ wid, checkedBy, notes, photo }) => {
  const formData = new FormData();
  formData.append("wid", wid);
  formData.append("checked_by", checkedBy);
  if (notes) {
    formData.append("notes", notes);
  }
  if (photo) {
    formData.append("photo", photo);
  }

  const response = await api.post("/verify", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

export const getReports = async (startDate, endDate, page = 1, limit = 50) => {
  const response = await api.get("/reports", {
    params: {
      start_date: startDate,
      end_date: endDate,
      page,
      limit,
    },
  });
  return response.data;
};

export const checkHealth = async () => {
  const response = await api.get("/health");
  return response.data;
};

export default api;
