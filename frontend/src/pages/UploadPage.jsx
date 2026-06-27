import React from "react";
import { Heading, Text, Card, Box } from "@radix-ui/themes";
import FileUploadZone from "../components/FileUploadZone";

export const UploadPage = () => {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Page Header */}
      <Box className="space-y-1">
        <Heading size="6" className="text-slate-800 font-bold tracking-tight">
          Bulk Product Import
        </Heading>
        <Text size="2" color="gray" className="font-medium text-slate-500">
          Upload a CSV file to populate or update product inventory.
        </Text>
      </Box>

      {/* CARD 1: CSV Template details matching the screenshot */}
      <Card size="3" className="hidden! lg:flex! shadow-sm border border-slate-100 rounded-xl bg-white p-5 w-full!">
        <div className="space-y-4 w-full">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">CSV Template</h3>
            <p className="text-xs text-slate-400 mt-0.5">The upload file must contain these columns.</p>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl w-full">
            <table className="min-w-full! text-xs text-left border-collapse text-slate-700">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="py-3.5 px-4 font-bold text-slate-400 font-mono tracking-wider">WID</th>
                  <th className="py-3.5 px-4 font-bold text-slate-400 font-mono tracking-wider">EAN</th>
                  <th className="py-3.5 px-4 font-bold text-slate-400 font-mono tracking-wider">Manufacturing_Date</th>
                  <th className="py-3.5 px-4 font-bold text-slate-400 font-mono tracking-wider">Expiry_Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono font-medium text-slate-600 bg-white">
                <tr className="hover:bg-slate-50/20">
                  <td className="py-3 px-4 text-slate-700 font-semibold">WID-100001</td>
                  <td className="py-3 px-4">5901234123457</td>
                  <td className="py-3 px-4">2024-01-15</td>
                  <td className="py-3 px-4 text-slate-500">2025-01-15</td>
                </tr>
                <tr className="hover:bg-slate-50/20">
                  <td className="py-3 px-4 text-slate-700 font-semibold">WID-100002</td>
                  <td className="py-3 px-4">5901234123457</td>
                  <td className="py-3 px-4">2024-02-10</td>
                  <td className="py-3 px-4 text-slate-500">2025-02-10</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* CARD 2 & 3: File Upload Zone & History Logs */}
      <FileUploadZone />
    </div>
  );
};

export default UploadPage;
