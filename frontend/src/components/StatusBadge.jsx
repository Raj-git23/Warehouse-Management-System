import React from "react";
import { Badge } from "@radix-ui/themes";

export const StatusBadge = ({ type, children }) => {
  let color = "gray";

  if (type === "success") {
    color = "green";
  } else if (type === "error" || type === "danger") {
    color = "red";
  } else if (type === "warning") {
    color = "orange";
  } else if (type === "info") {
    color = "blue";
  }

  return (
    <Badge color={color} size="2" variant="solid" className="px-2 py-1 rounded">
      {children}
    </Badge>
  );
};

export default StatusBadge;
