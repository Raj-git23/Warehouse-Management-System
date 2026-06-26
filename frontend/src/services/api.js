import axios from "axios";

const API_BASE_URL = "http://localhost:8000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
});

export const uploadCSV = async (files, onUploadProgress) => {
  const formData = new FormData();
  
  // Check if files is a FileList or Array, and append each
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
