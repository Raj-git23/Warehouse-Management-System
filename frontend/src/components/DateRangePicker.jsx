import React from "react";
import { Grid, Box, Text } from "@radix-ui/themes";
import { Calendar } from "lucide-react";

export const DateRangePicker = ({ startDate, setStartDate, endDate, setEndDate }) => {
  return (
    <Box className="w-full max-w-2xl bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
      <Grid columns={{ initial: "1", sm: "2" }} gap="4">
        {/* Start Date */}
        <div className="flex flex-col space-y-1.5">
          <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-blue-500" />
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 hover:bg-slate-100/50 transition-colors font-medium text-slate-700"
          />
        </div>

        {/* End Date */}
        <div className="flex flex-col space-y-1.5">
          <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-rose-500" />
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 hover:bg-slate-100/50 transition-colors font-medium text-slate-700"
          />
        </div>
      </Grid>
    </Box>
  );
};

export default DateRangePicker;
