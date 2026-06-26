import React from "react";
import { format, parseISO, isPast, isBefore, addDays } from "date-fns";
import { Calendar, Barcode, ShieldCheck, ShieldAlert, ShieldAlert as ShieldWarning } from "lucide-react";
import { Card, Heading, Text, Grid, Box } from "@radix-ui/themes";
import StatusBadge from "./StatusBadge";

export const ProductCard = ({ product, wid }) => {
  if (!product) return null;

  const { ean, manufacturing_date, expiry_date } = product;

  // Handle string dates or Date objects
  const parseDateStr = (dateStr) => {
    if (!dateStr) return new Date();
    return typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
  };

  const mfgDate = parseDateStr(manufacturing_date);
  const expDate = parseDateStr(expiry_date);
  const today = new Date();

  // Determine expiration status
  let statusText = "Valid";
  let statusType = "success";
  let StatusIcon = ShieldCheck;

  if (isPast(expDate)) {
    statusText = "Expired";
    statusType = "error";
    StatusIcon = ShieldAlert;
  } else if (isBefore(expDate, addDays(today, 30))) {
    statusText = "Expiring Soon";
    statusType = "warning";
    StatusIcon = ShieldWarning;
  }

  return (
    <Card size="3" className="shadow-lg border border-slate-100 rounded-xl overflow-hidden bg-white max-w-md w-full">
      <Box className="border-b border-slate-100 pb-3 mb-4 flex! items-center justify-between">
        <div>
          <Text size="1" color="gray" className="font-semibold uppercase tracking-wider">
            Warehouse Item
          </Text>
          <Heading size="4" className="text-slate-800 font-bold mt-0.5">
            ID: {wid}
          </Heading>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusIcon className={`w-5 h-5 ${statusType === "success" ? "text-green-600" : statusType === "warning" ? "text-amber-500" : "text-red-500"}`} />
          <StatusBadge type={statusType}>{statusText}</StatusBadge>
        </div>
      </Box>

      <Grid columns="1" gap="4" className="text-slate-700">
        {/* EAN / Barcode */}
        <div className="flex items-center space-x-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
          <Barcode className="w-5 h-5 text-slate-500" />
          <div>
            <Text size="1" color="gray" className="block leading-none">
              EAN (Product barcode)
            </Text>
            <Text size="3" className="font-mono font-semibold text-slate-800">
              {ean}
            </Text>
          </div>
        </div>

        {/* Manufacturing & Expiry Dates */}
        <Grid columns="2" gap="3">
          <div className="flex items-center space-x-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
            <Calendar className="w-5 h-5 text-blue-500" />
            <div>
              <Text size="1" color="gray" className="block leading-none">
                Mfg. Date
              </Text>
              <Text size="2" className="font-semibold text-slate-800">
                {format(mfgDate, "PPP")}
              </Text>
            </div>
          </div>

          <div className="flex items-center space-x-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
            <Calendar className="w-5 h-5 text-amber-500" />
            <div>
              <Text size="1" color="gray" className="block leading-none">
                Expiry Date
              </Text>
              <Text size="2" className="font-semibold text-slate-800">
                {format(expDate, "PPP")}
              </Text>
            </div>
          </div>
        </Grid>
      </Grid>
    </Card>
  );
};

export default ProductCard;
