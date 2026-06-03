import { HashRouter, Route } from "@solidjs/router";
import { ExternalLayout, InternalLayout } from "./layout";
import { AppStateProvider } from "./context/app_state";
import Auth from "./authentication/auth";
import Session from "./session/page";
import History from "./history/page";
import Files from "./files/page";

export default function App() {
  return (
    <AppStateProvider>
      <HashRouter>
        <Route path="/" component={ExternalLayout}>
          <Route path="/" component={Auth} />
        </Route>
        <Route path="/app" component={InternalLayout}>
          <Route path="/session" component={Session} />
          <Route path="/files" component={Files} />
          <Route path="/history" component={History} />
        </Route>
      </HashRouter>
    </AppStateProvider>
  );
}
