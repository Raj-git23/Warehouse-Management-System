import React, { useState, useRef, useEffect, useCallback } from "react";
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, FileText, Trash2, Zap, Database, Clock, WifiOff } from "lucide-react";
import { Progress, Card } from "@radix-ui/themes";
import { uploadCSV, pollJobStatus, fetchAllJobs } from "../services/api";

// --------------- Constants ---------------
const POLL_INTERVAL_MS = 4000;       // 4 seconds
const MAX_POLL_FAILURES = 5;         // stop polling after 5 consecutive failures
const LOCALSTORAGE_KEY = "active_jobs";

// --------------- localStorage helpers ---------------
function loadActiveJobs() {
  try {
    const saved = localStorage.getItem(LOCALSTORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveActiveJobs(jobs) {
  try {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(jobs));
  } catch {
    // localStorage may be full or unavailable — silently ignore
  }
}

function addActiveJob(jobId, filename, fileSize) {
  const current = loadActiveJobs();
  if (!current.find((j) => j.job_id === jobId)) {
    current.push({ job_id: jobId, filename, file_size: fileSize });
    saveActiveJobs(current);
  }
}

function removeActiveJob(jobId) {
  const current = loadActiveJobs();
  saveActiveJobs(current.filter((j) => j.job_id !== jobId));
}

// --------------- Component ---------------
export const FileUploadZone = ({ onUploadSuccess }) => {
  const [files, setFiles] = useState([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [status, setStatus] = useState("idle"); // idle, uploading, processing, success, error
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  // Active background jobs being polled
  const [activeJobs, setActiveJobs] = useState([]);
  // Map of job_id -> latest poll data
  const [jobProgress, setJobProgress] = useState({});
  // Polling refs
  const pollTimers = useRef({});
  const pollFailCounts = useRef({});

  const [recentUploads, setRecentUploads] = useState(() => {
    const saved = localStorage.getItem("recent_uploads");
    return saved ? JSON.parse(saved) : [];
  });

  const fileInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("recent_uploads", JSON.stringify(recentUploads));
  }, [recentUploads]);

  // --------------- Page-load recovery ---------------
  useEffect(() => {
    recoverJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup all polling on unmount
  useEffect(() => {
    return () => {
      Object.values(pollTimers.current).forEach(clearInterval);
    };
  }, []);

  const recoverJobs = async () => {
    try {
      // Get jobs from both localStorage and backend
      const localJobs = loadActiveJobs();
      let backendJobs = [];

      try {
        const data = await fetchAllJobs();
        backendJobs = data.jobs || [];
      } catch {
        // Backend may be down — just use localStorage
      }

      // Merge: find any active jobs from either source
      const activeJobIds = new Set();
      const jobsToTrack = [];

      // Add backend active jobs
      for (const job of backendJobs) {
        if (job.status === "pending" || job.status === "uploading" || job.status === "processing") {
          if (!activeJobIds.has(job.job_id)) {
            activeJobIds.add(job.job_id);
            jobsToTrack.push(job);
          }
        }
      }

      // Add localStorage active jobs not already tracked
      for (const localJob of localJobs) {
        if (!activeJobIds.has(localJob.job_id)) {
          // Verify it still exists on backend
          try {
            const jobData = await pollJobStatus(localJob.job_id);
            if (jobData.status === "pending" || jobData.status === "uploading" || jobData.status === "processing") {
              activeJobIds.add(localJob.job_id);
              jobsToTrack.push(jobData);
            } else {
              // Job completed/failed — clean from localStorage
              removeActiveJob(localJob.job_id);
            }
          } catch {
            // Job not found — clean from localStorage
            removeActiveJob(localJob.job_id);
          }
        }
      }

      if (jobsToTrack.length > 0) {
        // We have in-progress jobs — show processing state and start polling
        setActiveJobs(jobsToTrack);
        setStatus("processing");

        const progressMap = {};
        for (const job of jobsToTrack) {
          progressMap[job.job_id] = job;
          startPolling(job.job_id);
        }
        setJobProgress(progressMap);
      }
    } catch (err) {
      console.error("Failed to recover jobs:", err);
    }
  };

  // --------------- Polling ---------------
  const startPolling = useCallback((jobId) => {
    // Don't start duplicate timers
    if (pollTimers.current[jobId]) return;

    pollFailCounts.current[jobId] = 0;
    let currentInterval = POLL_INTERVAL_MS;

    const doPoll = async () => {
      try {
        const data = await pollJobStatus(jobId);
        pollFailCounts.current[jobId] = 0;

        // Reset interval to normal after successful poll
        if (currentInterval !== POLL_INTERVAL_MS) {
          currentInterval = POLL_INTERVAL_MS;
          clearInterval(pollTimers.current[jobId]);
          pollTimers.current[jobId] = setInterval(doPoll, currentInterval);
        }

        // Update progress
        setJobProgress((prev) => ({ ...prev, [jobId]: data }));

        if (data.status === "completed" || data.status === "failed") {
          // Stop polling
          clearInterval(pollTimers.current[jobId]);
          delete pollTimers.current[jobId];
          removeActiveJob(jobId);

          // Handle completion
          handleJobFinished(jobId, data);
        }
      } catch (err) {
        pollFailCounts.current[jobId] = (pollFailCounts.current[jobId] || 0) + 1;
        const fails = pollFailCounts.current[jobId];

        if (fails >= MAX_POLL_FAILURES) {
          // Stop polling, show error
          clearInterval(pollTimers.current[jobId]);
          delete pollTimers.current[jobId];

          setJobProgress((prev) => ({
            ...prev,
            [jobId]: {
              ...(prev[jobId] || {}),
              _connectionLost: true,
            },
          }));
        } else {
          // Exponential backoff: 4s → 8s → 16s
          const newInterval = POLL_INTERVAL_MS * Math.pow(2, fails);
          if (newInterval !== currentInterval) {
            currentInterval = newInterval;
            clearInterval(pollTimers.current[jobId]);
            pollTimers.current[jobId] = setInterval(doPoll, currentInterval);
          }
        }
      }
    };

    // Initial poll immediately
    doPoll();
    pollTimers.current[jobId] = setInterval(doPoll, currentInterval);
  }, []);

  const handleJobFinished = (jobId, data) => {
    if (data.status === "completed") {
      const finalResult = {
        success: true,
        total_rows: data.total_rows,
        inserted: data.inserted,
        skipped: data.skipped,
        error: data.error, // may contain partial error summary
        details: [{
          filename: data.filename,
          success: true,
          total_rows: data.total_rows,
          inserted: data.inserted,
          skipped: data.skipped,
        }],
      };

      setResult(finalResult);
      setStatus("success");
      saveToRecentUploads(finalResult);

      if (onUploadSuccess) {
        onUploadSuccess(finalResult);
      }
    } else if (data.status === "failed") {
      setError(data.error || "Processing failed.");
      setStatus("error");
    }

    // Remove from active tracking
    setActiveJobs((prev) => prev.filter((j) => j.job_id !== jobId));
  };

  const retryPoll = (jobId) => {
    pollFailCounts.current[jobId] = 0;
    setJobProgress((prev) => {
      const updated = { ...prev };
      if (updated[jobId]) {
        updated[jobId] = { ...updated[jobId], _connectionLost: false };
      }
      return updated;
    });
    startPolling(jobId);
  };

  // --------------- File handling ---------------
  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatNumber = (n) => {
    if (n === undefined || n === null) return "0";
    return n.toLocaleString();
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
    if (status === "uploading" || status === "processing") return;
    fileInputRef.current.click();
  };

  const handleRemoveFile = (index) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  /** Save completed upload(s) to recent uploads history */
  const saveToRecentUploads = (data) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let newUploads = [];

    if (data.details && data.details.length > 0) {
      newUploads = data.details.map((detail) => {
        const recordsStr = detail.success
          ? `${detail.inserted.toLocaleString()} records`
          : "Failed";

        let uploadStatus = "Failed";
        if (detail.success) {
          uploadStatus = detail.skipped > 0 ? "Warning" : "Completed";
        }

        return {
          name: detail.filename,
          records: recordsStr,
          time: `Today, ${timeStr}`,
          status: uploadStatus
        };
      });
    }

    if (newUploads.length > 0) {
      setRecentUploads(prev => [...newUploads, ...prev].slice(0, 8));
    }
  };

  // --------------- Upload handler ---------------
  const handleUpload = async () => {
    if (files.length === 0) return;

    setStatus("uploading");
    setProgress(0);
    setError("");

    try {
      const data = await uploadCSV(files, (percent) => {
        setProgress(percent);
      });

      // All files go through background processing
      const jobs = data.jobs || [];
      const successJobs = jobs.filter((j) => j.success && j.job_id);
      const failedJobs = jobs.filter((j) => !j.success);
      const duplicateJobs = jobs.filter((j) => j.duplicate);

      if (successJobs.length === 0 && failedJobs.length > 0) {
        setError(failedJobs.map((j) => `${j.filename}: ${j.error}`).join("; "));
        setStatus("error");
        return;
      }

      // Track all new + duplicate jobs
      const jobsToTrack = successJobs.map((j) => ({
        job_id: j.job_id,
        filename: j.filename,
        status: j.status,
        duplicate: j.duplicate || false,
      }));

      setActiveJobs(jobsToTrack);
      setStatus("processing");
      setProgress(100); // upload bytes sent — now processing

      // Save to localStorage and start polling for each
      for (const job of jobsToTrack) {
        const file = files.find((f) => f.name === job.filename);
        addActiveJob(job.job_id, job.filename, file?.size || 0);
        startPolling(job.job_id);
      }

      // Show duplicate notifications
      if (duplicateJobs.length > 0) {
        const dupNames = duplicateJobs.map((j) => j.filename).join(", ");
        console.info(`Duplicate upload detected for: ${dupNames}. Tracking existing jobs.`);
      }

    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.detail || "Upload failed. Please check your network and file format.";
      setError(typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg));
      setStatus("error");
    }
  };

  const handleReset = () => {
    // Stop all polling
    Object.values(pollTimers.current).forEach(clearInterval);
    pollTimers.current = {};
    pollFailCounts.current = {};

    setFiles([]);
    setStatus("idle");
    setProgress(0);
    setError("");
    setResult(null);
    setActiveJobs([]);
    setJobProgress({});
  };

  // --------------- Computed values ---------------
  // Aggregate progress from all active jobs
  const aggregateProgress = () => {
    const allData = Object.values(jobProgress);
    if (allData.length === 0) return null;

    let totalRows = 0;
    let processedRows = 0;
    let inserted = 0;
    let skipped = 0;

    for (const data of allData) {
      totalRows += data.total_rows || 0;
      processedRows += data.processed_rows || 0;
      inserted += data.inserted || 0;
      skipped += data.skipped || 0;
    }

    const percent = totalRows > 0
      ? Math.min(Math.round((processedRows / totalRows) * 100), 100)
      : 0;

    return { totalRows, processedRows, inserted, skipped, percent };
  };

  const hasConnectionLost = Object.values(jobProgress).some((j) => j._connectionLost);
  const agg = aggregateProgress();

  // --------------- Render ---------------
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
          {files.length > 0 && status !== "success" && status !== "processing" && (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {files.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-150 rounded-xl gap-2">
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
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

          {/* Uploading (sending bytes to server) */}
          {status === "uploading" && (
            <div className="space-y-3 bg-slate-50 p-4 border border-slate-150 rounded-xl">
              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <span className="flex items-center gap-2">
                  <UploadCloud className="w-3.5 h-3.5 animate-pulse text-blue-600" />
                  Uploading {files.length} file{files.length > 1 ? 's' : ''} to server...
                </span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} size="2" color="blue" className="w-full h-1.5 rounded" />
              <p className="text-[10px] text-slate-400 font-semibold">
                Sending file data to server. Processing will begin automatically.
              </p>
            </div>
          )}

          {/* Processing (background jobs with polling progress) */}
          {status === "processing" && (
            <div className="space-y-4 bg-gradient-to-br from-indigo-50/40 via-blue-50/30 to-violet-50/20 p-5 border border-indigo-100/60 rounded-xl">
              {/* Header */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="relative">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <Database className="w-4 h-4 text-indigo-600" />
                    </div>
                    {!hasConnectionLost && (
                      <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white animate-pulse" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider truncate">Processing in Background</h4>
                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5 truncate">
                      {activeJobs.length === 1
                        ? (activeJobs[0].filename || files[0]?.name || "CSV file")
                        : `${activeJobs.length} files`
                      }
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-100/70 rounded-md">
                  {hasConnectionLost ? (
                    <>
                      <WifiOff className="w-3 h-3 text-rose-500" />
                      <span className="text-[10px] font-bold text-rose-600 uppercase">Offline</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3 h-3 text-indigo-600 animate-pulse" />
                      <span className="text-[10px] font-bold text-indigo-700 uppercase">Live</span>
                    </>
                  )}
                </div>
              </div>

              {/* Deterministic progress bar */}
              {agg && agg.totalRows > 0 ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold text-slate-500">
                    <span>{formatNumber(agg.processedRows)} / {formatNumber(agg.totalRows)} rows</span>
                    <span>{agg.percent}%</span>
                  </div>
                  <Progress value={agg.percent} size="2" color="indigo" className="w-full h-2 rounded" />
                </div>
              ) : (
                <div className="relative w-full h-2 bg-indigo-100/60 rounded-full overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-400 via-blue-500 to-indigo-400 rounded-full animate-indeterminate" />
                </div>
              )}

              {/* Connection lost warning */}
              {hasConnectionLost && (
                <div className="flex items-center justify-between bg-rose-50 border border-rose-100 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <WifiOff className="w-4 h-4 text-rose-500" />
                    <span className="text-xs font-bold text-rose-700">Connection lost. Processing may still continue on the server.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      for (const job of activeJobs) {
                        retryPoll(job.job_id);
                      }
                    }}
                    className="px-3 py-1.5 text-[10px] font-bold bg-white border border-rose-200 text-rose-700 rounded-md hover:bg-rose-50 cursor-pointer transition-colors"
                  >
                    Check Status
                  </button>
                </div>
              )}

              {/* Live Stats Grid */}
              {agg && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="bg-white/80 backdrop-blur-sm p-3 border border-slate-100/60 rounded-lg text-center shadow-sm">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Processed</p>
                    <p className="text-lg font-bold text-slate-800 tabular-nums leading-tight">
                      {formatNumber(agg.processedRows)}
                    </p>
                  </div>
                  <div className="bg-white/80 backdrop-blur-sm p-3 border border-emerald-100/60 rounded-lg text-center shadow-sm">
                    <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Inserted</p>
                    <p className="text-lg font-bold text-emerald-600 tabular-nums leading-tight">
                      {formatNumber(agg.inserted)}
                    </p>
                  </div>
                  <div className="bg-white/80 backdrop-blur-sm p-3 border border-amber-100/60 rounded-lg text-center shadow-sm">
                    <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest mb-1">Skipped</p>
                    <p className="text-lg font-bold text-amber-600 tabular-nums leading-tight">
                      {formatNumber(agg.skipped)}
                    </p>
                  </div>
                </div>
              )}

              {!agg && (
                <div className="flex items-center justify-center gap-2 py-3 text-xs font-semibold text-slate-500">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                  Waiting for processing to start...
                </div>
              )}

              {/* Info text */}
              <div className="flex items-center gap-2 justify-center">
                <Clock className="w-3 h-3 text-slate-400" />
                <p className="text-[10px] text-slate-400 font-semibold text-center leading-relaxed">
                  Polling every 4s • {activeJobs.length} active job{activeJobs.length !== 1 ? 's' : ''} • You can safely navigate away
                </p>
              </div>
            </div>
          )}

          {/* Success summary */}
          {status === "success" && result && (() => {
            const allSkipped = result.total_rows > 0 && result.inserted === 0;
            const anySkipped = result.skipped > 0;

            let bannerBg = "bg-emerald-50 border-emerald-100 text-emerald-800";
            let bannerIconColor = "text-emerald-600";
            let BannerIcon = CheckCircle2;
            let bannerTitle = `Import completed successfully`;
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
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
                      <div key={dIdx} className="bg-white/80 p-2.5 rounded-lg border border-slate-100/70 flex items-center justify-between gap-2 text-xs font-semibold text-slate-700 shadow-inner">
                        <span className="truncate flex-1 min-w-0" title={detail.filename}>{detail.filename}</span>
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

                {/* Partial error warning */}
                {result.error && (
                  <div className="flex items-start space-x-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-700 font-semibold leading-relaxed">
                      Some batches encountered errors: {result.error}
                    </p>
                  </div>
                )}

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

          {recentUploads.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-xs text-slate-400 font-semibold">No recent uploads yet.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentUploads.map((up, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 p-3.5 border border-slate-100 rounded-xl bg-white hover:bg-slate-50/50 transition-colors shadow-sm"
                >
                <div className="flex items-center space-x-3.5 min-w-0 flex-1">
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
          )}
        </div>
      </Card>
    </div>
  );
};

export default FileUploadZone;
