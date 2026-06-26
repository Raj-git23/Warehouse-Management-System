import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "@radix-ui/themes/styles.css";

import PageLayout from "./components/PageLayout";
import UploadPage from "./pages/UploadPage";
import VerifyPage from "./pages/VerifyPage";
import ReportsPage from "./pages/ReportsPage";

function App() {
  return (
    <Router>
      <PageLayout>
        <Routes>
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          {/* Default redirect to Verify Page */}
          <Route path="*" element={<Navigate to="/verify" replace />} />
        </Routes>
      </PageLayout>
    </Router>
  );
}

export default App;
