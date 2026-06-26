import React, { useState, useRef, useEffect } from "react";
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, FileText, Trash2 } from "lucide-react";
import { Progress, Card } from "@radix-ui/themes";
import { uploadCSV } from "../services/api";

export const FileUploadZone = ({ onUploadSuccess }) => {
  const [files, setFiles] = useState([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [status, setStatus] = useState("idle"); // idle, uploading, success, error
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [recentUploads, setRecentUploads] = useState(() => {
    const saved = localStorage.getItem("recent_uploads");
    return saved ? JSON.parse(saved) : [
      {
        name: "inventory_2026_06_25.csv",
        records: "4,520 records",
        time: "Today, 09:14 AM",
        status: "Completed"
      },
      {
        name: "inventory_2026_06_24.csv",
        records: "3,890 records",
        time: "Yesterday, 04:30 PM",
        status: "Completed"
      }
    ];
  });

  const fileInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("recent_uploads", JSON.stringify(recentUploads));
  }, [recentUploads]);

  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const validateAndSetFiles = (selectedFiles) => {
    setError("");
    if (!selectedFiles || selectedFiles.length === 0) return;

    const validFiles = [];
    const invalidFiles = [];

    Array.from(selectedFiles).forEach((f) => {
      if (f.name.endsWith(".csv")) {
        validFiles.push(f);
      } else {
        invalidFiles.push(f.name);
      }
    });

    if (invalidFiles.length > 0) {
      setError(`Supported formats: CSV only. Skipped: ${invalidFiles.join(", ")}`);
    }

    if (validFiles.length > 0) {
      setFiles((prev) => {
        // Prevent duplicate file entries by name
        const existingNames = new Set(prev.map((f) => f.name));
        const filteredNew = validFiles.filter((f) => !existingNames.has(f.name));
        return [...prev, ...filteredNew];
      });
      setStatus("idle");
      setResult(null);
      setProgress(0);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFiles(e.target.files);
    }
  };

  const handleButtonClick = () => {
    if (status === "uploading") return;
    fileInputRef.current.click();
  };

  const handleRemoveFile = (index) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setStatus("uploading");
    setProgress(0);

    try {
      const data = await uploadCSV(files, (percent) => {
        setProgress(percent);
      });

      setResult(data);
      setStatus("success");

      // Save to recent uploads history
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const newUploads = files.map((file) => {
        const fileDetail = data.details?.find((d) => d.filename === file.name);
        const recordsStr = fileDetail && fileDetail.success
          ? `${fileDetail.inserted.toLocaleString()} records`
          : "Failed";

        let status = "Failed";
        if (fileDetail && fileDetail.success) {
          status = fileDetail.skipped > 0 ? "Warning" : "Completed";
        }

        return {
          name: file.name,
          records: recordsStr,
          time: `Today, ${timeStr}`,
          status: status
        };
      });

      setRecentUploads(prev => [...newUploads, ...prev].slice(0, 8));

      if (onUploadSuccess) {
        onUploadSuccess(data);
      }
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.detail || "Upload failed. Please check your network and files format.";
      setError(errMsg);
      setStatus("error");
    }
  };

  const handleReset = () => {
    setFiles([]);
    setStatus("idle");
    setProgress(0);
    setError("");
    setResult(null);
  };

  return (
    <div className="space-y-6 w-full max-w-3xl mx-auto">
      {/* CARD 2: Upload File card matching the layout */}
      <Card size="3" className="shadow-sm border border-slate-100 rounded-xl bg-white p-5">
        <div className="space-y-5">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Upload files</h3>
              <p className="text-xs text-slate-400 mt-0.5">Drag and drop CSV files or click to browse. Multiple selection allowed.</p>
            </div>
            {files.length > 0 && status === "idle" && (
              <button
                type="button"
                onClick={handleReset}
                className="text-xs font-bold text-rose-600 hover:text-rose-800 transition-colors cursor-pointer border border-rose-100 rounded-lg px-2.5 py-1 hover:bg-rose-50"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Dotted Upload Drag Zone */}
          {status === "idle" && (
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={handleButtonClick}
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${isDragActive
                ? "border-blue-500 bg-blue-50/50 scale-[0.99]"
                : "border-slate-200 hover:border-blue-400 hover:bg-slate-50/50"
                }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleChange}
                multiple
              />
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 mb-3">
                <UploadCloud className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-slate-700 text-center">
                Click to upload or drag and drop files
              </p>
              <p className="text-[10px] font-semibold text-slate-400 mt-1">
                Select multiple files to import product details
              </p>
            </div>
          )}

          {/* Selected files preview list */}
          {files.length > 0 && status !== "success" && (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {files.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-150 rounded-xl">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600 flex-shrink-0">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{file.name}</p>
                      <p className="text-[10px] text-slate-400 font-semibold">{formatBytes(file.size)}</p>
                    </div>
                  </div>
                  {status !== "uploading" && (
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(idx)}
                      className="p-1.5 rounded-lg text-slate-450 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer border-0 bg-transparent"
                      title="Remove file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Action Trigger Button */}
          {status === "idle" && (
            <button
              type="button"
              onClick={files.length > 0 ? handleUpload : handleButtonClick}
              className="w-full py-3 rounded-lg text-sm font-bold transition-all border border-blue-600 bg-blue-600 hover:bg-blue-750 text-white cursor-pointer shadow-sm select-none"
            >
              {files.length > 0
                ? `Import Product Details`
                : "Select CSV files to import"
              }
            </button>
          )}

          {/* Ingesting progression */}
          {status === "uploading" && (
            <div className="space-y-3 bg-slate-50 p-4 border border-slate-150 rounded-xl">
              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  Ingesting {files.length} files...
                </span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} size="2" color="blue" className="w-full h-1.5 rounded" />
            </div>
          )}

          {/* Success summary */}
          {status === "success" && result && (() => {
            const allSkipped = result.total_rows > 0 && result.inserted === 0;
            const anySkipped = result.skipped > 0;

            let bannerBg = "bg-emerald-50 border-emerald-100 text-emerald-800";
            let bannerIconColor = "text-emerald-600";
            let BannerIcon = CheckCircle2;
            let bannerTitle = `Processed ${result.total_files} file${result.total_files > 1 ? 's' : ''} successfully`;
            let bannerDesc = "All product records have been successfully imported into the database.";

            if (allSkipped) {
              bannerBg = "bg-amber-50 border-amber-100 text-amber-850";
              bannerIconColor = "text-amber-600";
              BannerIcon = AlertCircle;
              bannerTitle = "Import Complete: All records were skipped";
              bannerDesc = "No new products were added. All items in the uploaded file(s) are duplicates.";
            } else if (anySkipped) {
              bannerBg = "bg-amber-50 border-amber-100 text-amber-850";
              bannerIconColor = "text-amber-600";
              BannerIcon = AlertCircle;
              bannerTitle = `Import Complete: ${result.skipped.toLocaleString()} record${result.skipped > 1 ? 's' : ''} skipped`;
              bannerDesc = `${result.inserted.toLocaleString()} new products imported. ${result.skipped.toLocaleString()} duplicates/errors skipped.`;
            }

            return (
              <div className={`${allSkipped || anySkipped ? 'bg-amber-50/20 border-amber-100' : 'bg-emerald-50/20 border-emerald-100'} border rounded-xl p-5 space-y-4`}>
                <div className={`flex items-start space-x-3 p-3.5 rounded-lg border ${bannerBg}`}>
                  <BannerIcon className={`w-5 h-5 ${bannerIconColor} flex-shrink-0 mt-0.5`} />
                  <div>
                    <h4 className="text-xs font-bold leading-tight uppercase tracking-wider">{bannerTitle}</h4>
                    <p className="text-[11px] font-semibold mt-1 opacity-90 leading-relaxed">{bannerDesc}</p>
                  </div>
                </div>

                {/* Main overall counts */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-white p-3 border border-slate-100 rounded-lg shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Rows</p>
                    <p className="text-xl font-bold text-slate-800 mt-1">{result.total_rows.toLocaleString()}</p>
                  </div>
                  <div className="bg-white p-3 border border-slate-150 rounded-lg shadow-sm">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Inserted</p>
                    <p className="text-xl font-bold text-emerald-600 mt-1">{result.inserted.toLocaleString()}</p>
                  </div>
                  <div className="bg-white p-3 border border-slate-150 rounded-lg shadow-sm">
                    <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Skipped</p>
                    <p className="text-xl font-bold text-amber-600 mt-1">{result.skipped.toLocaleString()}</p>
                  </div>
                </div>

                {/* Detail list per file */}
                <div className="space-y-1.5 pt-1.5">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Upload details:</p>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {result.details?.map((detail, dIdx) => (
                      <div key={dIdx} className="bg-white/80 p-2.5 rounded-lg border border-slate-100/70 flex items-center justify-between text-xs font-semibold text-slate-700 shadow-inner">
                        <span className="truncate max-w-[280px]" title={detail.filename}>{detail.filename}</span>
                        {detail.success ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${detail.skipped > 0
                            ? 'bg-amber-50 text-amber-800 border-amber-100'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-100'
                            }`}>
                            {detail.inserted.toLocaleString()} ins / {detail.skipped.toLocaleString()} skip
                          </span>
                        ) : (
                          <span className="text-[10px] bg-rose-50 text-rose-700 font-bold px-1.5 py-0.5 rounded border border-rose-100 truncate max-w-[150px]" title={detail.error}>
                            Failed: {detail.error}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-2 text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg cursor-pointer transition-all shadow-sm"
                  >
                    Upload More Files
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Error Banner */}
          {status === "error" && (
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-5 space-y-3">
              <div className="flex items-center space-x-2.5 text-rose-800">
                <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                <h4 className="text-sm font-bold">Ingestion Failed</h4>
              </div>
              <p className="text-xs text-rose-700 leading-relaxed font-medium">{error}</p>
              <div className="flex justify-end pt-1 gap-2.5">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg cursor-pointer transition-all"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  className="px-4 py-2 text-xs font-bold border border-rose-600 bg-rose-600 hover:bg-rose-700 text-white rounded-lg cursor-pointer transition-all"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* CARD 3: Recent Uploads list matching the layout */}
      <Card size="3" className="shadow-sm border border-slate-100 rounded-xl bg-white p-5">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Recent Uploads</h3>
            <p className="text-xs text-slate-400 mt-0.5">History of bulk imports.</p>
          </div>

          <div className="space-y-2.5">
            {recentUploads.map((up, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3.5 border border-slate-100 rounded-xl bg-white hover:bg-slate-50/50 transition-colors shadow-sm"
              >
                <div className="flex items-center space-x-3.5 min-w-0">
                  <div className="p-2 bg-slate-100 rounded-lg text-slate-500 flex-shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{up.name}</p>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                      {up.records} &bull; {up.time}
                    </p>
                  </div>
                </div>
                <div>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${up.status === "Completed"
                    ? "bg-green-50 text-green-700 border-green-100"
                    : up.status === "Warning"
                      ? "bg-amber-50 text-amber-700 border-amber-100"
                      : "bg-rose-50 text-rose-700 border-rose-100"
                    }`}>
                    {up.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default FileUploadZone;
