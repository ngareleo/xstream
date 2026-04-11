import { type FC } from "react";
import { Routes, Route } from "react-router-dom";
import { AppShell } from "./components/Layout/AppShell.js";
import { Dashboard } from "./pages/Dashboard/Dashboard.js";
import { Library } from "./pages/Library/Library.js";
import { Watchlist } from "./pages/Watchlist/Watchlist.js";
import { Settings } from "./pages/Settings/Settings.js";
import { Feedback } from "./pages/Feedback/Feedback.js";
import { Player } from "./pages/Player/Player.js";
import { Goodbye } from "./pages/Goodbye/Goodbye.js";
import { NotFound } from "./pages/NotFound/NotFound.js";

export const App: FC = () => {
  return (
    <Routes>
      {/* Full-screen pages — no app shell */}
      <Route path="/player/:filmId" element={<Player />} />
      <Route path="/goodbye" element={<Goodbye />} />

      {/* All other pages share the app-shell layout */}
      <Route
        path="/*"
        element={
          <AppShell>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/library" element={<Library />} />
              <Route path="/watchlist" element={<Watchlist />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/feedback" element={<Feedback />} />
              {/* Catch-all — must be last */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppShell>
        }
      />
    </Routes>
  );
};
