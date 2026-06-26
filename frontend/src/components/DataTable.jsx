import React from "react";
import { Table, Button, Flex, Text } from "@radix-ui/themes";
import { Download, ChevronLeft, ChevronRight, Inbox } from "lucide-react";

export const DataTable = ({
  columns,
  data,
  page,
  setPage,
  hasMore,
  isLoading,
  exportFilename = "data_export"
}) => {
  const exportToCSV = () => {
    if (!data || data.length === 0) return;

    // Build headers from columns definitions
    const headers = columns.map((col) => col.header);
    const csvRows = [headers.join(",")];

    // Build rows
    for (const row of data) {
      const values = columns.map((col) => {
        let val = "";
        if (col.accessor) {
          val = col.accessor(row);
        } else if (col.field) {
          val = row[col.field];
        }
        
        // Escape quotes
        const escaped = ("" + (val === null || val === undefined ? "" : val)).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(","));
    }

    // Create file and download
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${exportFilename}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Export Toolbar */}
      {data && data.length > 0 && (
        <Flex justify="end">
          <Button
            size="2"
            color="indigo"
            onClick={exportToCSV}
            className="flex items-center gap-1.5 cursor-pointer border border-indigo-600 font-medium"
          >
            <Download className="w-4 h-4" /> Export Report (CSV)
          </Button>
        </Flex>
      )}

      {/* Main Table */}
      <div className="border border-slate-100 rounded-xl bg-white shadow-sm overflow-x-auto max-w-full">
        {data && data.length > 0 ? (
          <Table.Root variant="surface" className="min-w-[700px] sm:min-w-0">
            <Table.Header className="bg-slate-50/80 border-b border-slate-100">
              <Table.Row>
                {columns.map((col, idx) => (
                  <Table.ColumnHeaderCell
                    key={idx}
                    className="text-slate-500 font-semibold py-3 px-4 text-sm"
                  >
                    {col.header}
                  </Table.ColumnHeaderCell>
                ))}
              </Table.Row>
            </Table.Header>

            <Table.Body>
              {data.map((row, rowIdx) => (
                <Table.Row
                  key={rowIdx}
                  className="hover:bg-slate-50/50 transition-colors border-b border-slate-100/50 last:border-0"
                >
                  {columns.map((col, colIdx) => {
                    const cellContent = col.render
                      ? col.render(row)
                      : col.accessor
                      ? col.accessor(row)
                      : row[col.field];
                    return (
                      <Table.Cell
                        key={colIdx}
                        className="py-3.5 px-4 text-slate-700 text-sm align-middle"
                      >
                        {cellContent}
                      </Table.Cell>
                    );
                  })}
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-3">
            <Inbox className="w-12 h-12 text-slate-300" />
            <div>
              <h3 className="text-md font-bold text-slate-700">No Records Found</h3>
              <p className="text-sm text-slate-400 max-w-[260px] mx-auto mt-0.5">
                No logs match the requested date filters. Try modifying your range parameters.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {data && data.length > 0 && (
        <Flex justify="between" align="center" className="pt-2 px-2">
          <Text size="2" color="gray" className="font-medium">
            Page {page}
          </Text>
          <Flex gap="2">
            <Button
              size="2"
              variant="outline"
              color="gray"
              disabled={page === 1 || isLoading}
              onClick={() => setPage(page - 1)}
              className="flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </Button>
            <Button
              size="2"
              variant="outline"
              color="gray"
              disabled={!hasMore || isLoading}
              onClick={() => setPage(page + 1)}
              className="flex items-center gap-1 cursor-pointer"
            >
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </Flex>
        </Flex>
      )}
    </div>
  );
};

export default DataTable;
