import React, { useState } from "react";
import { Heading, Text, Card, Box } from "@radix-ui/themes";
import { Calendar, RefreshCw, FileText, Camera, Inbox } from "lucide-react";
import { format, subDays, parseISO } from "date-fns";
import DataTable from "../components/DataTable";
import ErrorMessage from "../components/ErrorMessage";
import LoadingSpinner from "../components/LoadingSpinner";
import { getReports } from "../services/api";

export const ReportsPage = () => {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reports, setReports] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  
  const limit = 50;

  const fetchVerificationReports = async (pageNum = 1) => {
    if (!startDate || !endDate) {
      setError("Please select both start and end dates.");
      return;
    }
    
    setError("");
    setLoading(true);
    try {
      const data = await getReports(startDate, endDate, pageNum, limit);
      setReports(data);
      setPage(pageNum);
      setHasMore(data.length === limit);
      setHasSearched(true);
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.detail || err.message || "Failed to load reports.";
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage) => {
    fetchVerificationReports(newPage);
  };

  const columns = [
    {
      header: "WID",
      field: "wid",
      render: (row) => <span className="font-mono font-bold text-slate-800">{row.wid}</span>,
    },
    {
      header: "EAN",
      field: "ean",
      render: (row) => <span className="font-mono text-slate-500">{row.ean}</span>,
    },
    {
      header: "Mfg Date",
      field: "manufacturing_date",
      render: (row) => (
        <span className="font-medium text-slate-650">
          {format(parseISO(row.manufacturing_date), "yyyy-MM-dd")}
        </span>
      ),
    },
    {
      header: "Expiry Date",
      field: "expiry_date",
      render: (row) => (
        <span className="font-medium text-slate-650">
          {format(parseISO(row.expiry_date), "yyyy-MM-dd")}
        </span>
      ),
    },
    {
      header: "Checked By",
      field: "checked_by",
      render: (row) => <span className="font-bold text-indigo-650">{row.checked_by}</span>,
    },
    {
      header: "Checked At",
      field: "checked_at",
      render: (row) => (
        <span className="text-slate-500 font-medium">
          {format(parseISO(row.checked_at), "yyyy-MM-dd HH:mm:ss")}
        </span>
      ),
    },
    {
      header: "Photo",
      field: "photo_url",
      render: (row) =>
        row.photo_url ? (
          <a
            href={`http://localhost:8000${row.photo_url}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Click to view image"
          >
            <img
              src={`http://localhost:8000${row.photo_url}`}
              alt="evidence"
              className="w-9 h-9 object-cover rounded-lg border border-slate-200 hover:scale-105 transition-all cursor-zoom-in shadow-sm"
            />
          </a>
        ) : (
          <span className="text-slate-400 font-medium text-xs">No photo</span>
        ),
    },
    {
      header: "Notes",
      field: "notes",
      render: (row) => (
        <span className="text-slate-600 text-xs max-w-xs block truncate font-medium" title={row.notes}>
          {row.notes || "-"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <Box className="space-y-1">
        <Heading size="6" className="text-slate-800 font-bold tracking-tight">
          Verification Reports
        </Heading>
        <Text size="2" color="gray" className="font-medium text-slate-500">
          Generate a report of all verification activities within a date range.
        </Text>
      </Box>

      {/* CARD 1: Filters Card matching screenshot */}
      <Card size="3" className="shadow-sm border border-slate-100 bg-white p-5">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Report Filters</h3>
            <p className="text-xs text-slate-400 mt-0.5">Select a start and end date to filter verification events.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-end">
            {/* Start Date */}
            <div className="flex flex-col space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                Start Date
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <Calendar className="w-4 h-4" />
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50 font-semibold text-slate-700 placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* End Date */}
            <div className="flex flex-col space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                End Date
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <Calendar className="w-4 h-4" />
                </span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50 font-semibold text-slate-700 placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Submit Filter Button */}
            <button
              type="button"
              onClick={() => fetchVerificationReports(1)}
              disabled={loading}
              className="py-2.5 px-6 rounded-lg text-sm font-bold transition-all border border-blue-600 bg-blue-600 hover:bg-blue-750 text-white cursor-pointer shadow-sm select-none h-[42px] flex items-center gap-2 justify-center"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Fetching...
                </>
              ) : (
                "Generate Report"
              )}
            </button>
          </div>
        </div>
      </Card>

      {/* Error display */}
      {error && <ErrorMessage message={error} />}

      {/* CARD 2: Report Results Grid or Empty Placeholder */}
      <Card size="3" className="shadow-sm border border-slate-100 bg-white p-5">
        {loading ? (
          <LoadingSpinner label="Loading verification reports..." />
        ) : hasSearched ? (
          <DataTable
            columns={columns}
            data={reports}
            page={page}
            setPage={handlePageChange}
            hasMore={hasMore}
            isLoading={loading}
            exportFilename="verifyflow_reports"
          />
        ) : (
          /* Empty Initial Placeholder matching screenshot */
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-700">No report generated yet</h3>
              <p className="text-xs text-slate-400 max-w-[280px] mx-auto leading-relaxed">
                Select a date range and click Generate Report.
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ReportsPage;
