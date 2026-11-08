import { Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import SetupPage from "./pages/SetupPage";

export default function App() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}
