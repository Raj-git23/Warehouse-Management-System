import React from "react";
import { AlertCircle } from "lucide-react";

export const ErrorMessage = ({ message }) => {
  if (!message) return null;

  return (
    <div className="flex items-start p-4 space-x-3 bg-red-50 border-l-4 border-red-500 rounded-r text-red-700">
      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div>
        <h4 className="text-sm font-semibold">Error</h4>
        <p className="text-sm mt-0.5 leading-relaxed">{message}</p>
      </div>
    </div>
  );
};

export default ErrorMessage;
