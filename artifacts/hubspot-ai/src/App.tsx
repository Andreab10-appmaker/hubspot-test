import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StageOptionsProvider } from "@/lib/stage-context";
import AppShell from "@/components/AppShell";
import Dashboard from "@/pages/Dashboard";
import Companies from "@/pages/Companies";
import Contacts from "@/pages/Contacts";
import Deals from "@/pages/Deals";
import Insight from "@/pages/Insight";
import ChatInterface from "@/components/ChatInterface";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/companies" component={Companies} />
      <Route path="/contacts" component={Contacts} />
      <Route path="/deals" component={Deals} />
      <Route path="/insight" component={Insight} />
      <Route path="/chat" component={ChatInterface} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <StageOptionsProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppShell>
              <Router />
            </AppShell>
          </WouterRouter>
        </StageOptionsProvider>
        <Toaster />
        <SonnerToaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
