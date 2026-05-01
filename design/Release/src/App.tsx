import { type FC } from "react";
import { Routes, Route } from "react-router-dom";
import { AppShell } from "./components/Layout/AppShell.js";
import { Profiles } from "./pages/Profiles/Profiles.js";
import { Library } from "./pages/Library/Library.js";
import { Player } from "./pages/Player/Player.js";
import { Settings } from "./pages/Settings/Settings.js";
import { Goodbye } from "./pages/Goodbye/Goodbye.js";
import { NotFound } from "./pages/NotFound/NotFound.js";
import { DesignSystem } from "./pages/DesignSystem/DesignSystem.js";

export const App: FC = () => {
  return (
    <Routes>
      {/* Full-screen pages — bypass the app shell */}
      <Route path="/player/:filmId" element={<Player />} />
      <Route path="/goodbye" element={<Goodbye />} />

      {/* All other pages share the AppShell layout */}
      <Route
        path="/*"
        element={
          <AppShell>
            <Routes>
              <Route path="/" element={<Profiles />} />
              <Route path="/library" element={<Library />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/design-system" element={<DesignSystem />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppShell>
        }
      />
    </Routes>
  );
};
