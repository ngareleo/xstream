import { type FC } from "react";
import { Routes, Route } from "react-router-dom";
import { AppShell } from "./components/Layout/AppShell.js";
import { Profiles } from "./pages/Profiles/Profiles.js";
import { CreateProfile } from "./pages/CreateProfile/CreateProfile.js";
import { EditProfile } from "./pages/EditProfile/EditProfile.js";
import { Library } from "./pages/Library/Library.js";
import { Watchlist } from "./pages/Watchlist/Watchlist.js";
import { Player } from "./pages/Player/Player.js";
import { Settings } from "./pages/Settings/Settings.js";
import { Goodbye } from "./pages/Goodbye/Goodbye.js";
import { NotFound } from "./pages/NotFound/NotFound.js";
import { DesignSystem } from "./pages/DesignSystem/DesignSystem.js";
import { ErrorPage } from "./pages/Error/Error.js";

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
              <Route path="/" element={<Library />} />
              <Route path="/profiles" element={<Profiles />} />
              <Route path="/profiles/new" element={<CreateProfile />} />
              <Route path="/profiles/:profileId/edit" element={<EditProfile />} />
              <Route path="/watchlist" element={<Watchlist />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/design-system" element={<DesignSystem />} />
              <Route path="/error" element={<ErrorPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppShell>
        }
      />
    </Routes>
  );
};
