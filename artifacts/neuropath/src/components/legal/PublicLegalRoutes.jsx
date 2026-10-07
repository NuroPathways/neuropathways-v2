import { Route, Routes } from "react-router-dom";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import LegalDocument from "./LegalDocument";
import { legalContent } from "./legalContent";

// Only informational legal pages bypass the existing account-specific router.
// All other paths retain the original authenticated application unchanged.
export default function PublicLegalRoutes({ children }) {
  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPolicy />} />
      {Object.entries(legalContent).map(([path, document]) => (
        <Route key={path} path={path} element={<LegalDocument document={document} />} />
      ))}
      <Route path="*" element={children} />
    </Routes>
  );
}
