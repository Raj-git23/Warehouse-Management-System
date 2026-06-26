import React from "react";
import { Camera, RefreshCw, XCircle, Trash2 } from "lucide-react";
import { Button, Text, Box } from "@radix-ui/themes";

export const CameraCapture = ({ camera }) => {
  const {
    videoRef,
    photo,
    isActive,
    error,
    startCamera,
    stopCamera,
    capturePhoto,
    retakePhoto,
    resetCameraState
  } = camera;

  return (
    <div className="w-full">
      {/* 1. Camera Idle State (Dotted upload-style placeholder matching screenshot) */}
      {!isActive && !photo && (
        <div
          onClick={startCamera}
          className="border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-slate-50/50 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all bg-white shadow-sm group"
        >
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 group-hover:scale-105 transition-transform mb-3">
            <Camera className="w-5 h-5" />
          </div>
          <Text size="3" className="font-semibold text-slate-700">
            Take photo
          </Text>
          <Text size="1" color="gray" className="mt-0.5 font-medium">
            Use device camera
          </Text>
          {error && (
            <Text size="1" color="red" className="mt-2.5 font-semibold bg-red-50 px-2 py-0.5 rounded border border-red-100">
              {error}
            </Text>
          )}
        </div>
      )}

      {/* 2. Video Streaming Feed (Webcam Active) */}
      {isActive && !photo && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-black shadow-sm relative flex flex-col items-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-64 object-cover"
          />
          {/* Action Overlay */}
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4">
            <button
              type="button"
              onClick={stopCamera}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all border border-slate-700 bg-slate-800/85 hover:bg-slate-750 text-white cursor-pointer shadow-sm select-none"
            >
              <XCircle className="w-4 h-4" /> Cancel
            </button>
            <button
              type="button"
              onClick={capturePhoto}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all border border-blue-600 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-sm select-none"
            >
              <Camera className="w-4 h-4" /> Capture Photo
            </button>
          </div>
        </div>
      )}

      {/* 3. Photo Captured / Taken State */}
      {photo && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm relative flex flex-col items-center">
          <img
            src={photo}
            alt="Physical product evidence tag"
            className="w-full h-64 object-cover"
          />
          {/* Action Overlay */}
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4">
            <button
              type="button"
              onClick={retakePhoto}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all border border-slate-700 bg-slate-800/85 hover:bg-slate-750 text-white cursor-pointer shadow-sm select-none"
            >
              <RefreshCw className="w-4 h-4" /> Retake
            </button>
            <button
              type="button"
              onClick={resetCameraState}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all border border-rose-600 bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-sm select-none"
            >
              <Trash2 className="w-4 h-4" /> Clear Photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraCapture;
