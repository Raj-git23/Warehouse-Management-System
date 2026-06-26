import { useState, useRef, useCallback, useEffect } from "react";

export const useCamera = () => {
  const [stream, setStream] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [error, setError] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const videoRef = useRef(null);

  // Safe binding effect to assign the active stream to the video DOM element on mount
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, videoRef]);

  const startCamera = useCallback(async () => {
    setError(null);
    setPhoto(null);
    setPhotoFile(null);
    try {
      // Use environment facing camera (back camera) for barcode scanning scenarios
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      setStream(mediaStream);
      setIsActive(true);
    } catch (err) {
      console.error("Camera access error:", err);
      setError("Unable to access camera. Please check permissions.");
      setIsActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsActive(false);
  }, [stream]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const context = canvas.getContext("2d");
    if (context) {
      // Draw video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Get base64 data URL for preview
      const dataUrl = canvas.toDataURL("image/jpeg");
      setPhoto(dataUrl);

      // Convert canvas to Blob/File for uploads
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `photo_${Date.now()}.jpg`, {
            type: "image/jpeg",
          });
          setPhotoFile(file);
        }
      }, "image/jpeg", 0.85);
    }

    // Stop camera streaming after capture
    stopCamera();
  }, [stopCamera]);

  const retakePhoto = useCallback(() => {
    setPhoto(null);
    setPhotoFile(null);
    startCamera();
  }, [startCamera]);

  const resetCameraState = useCallback(() => {
    stopCamera();
    setPhoto(null);
    setPhotoFile(null);
    setError(null);
  }, [stopCamera]);

  return {
    videoRef,
    stream,
    photo,
    photoFile,
    error,
    isActive,
    startCamera,
    stopCamera,
    capturePhoto,
    retakePhoto,
    resetCameraState,
  };
};

export default useCamera;
