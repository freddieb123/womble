import { Switch, Route } from "wouter";
import Home from "./pages/Home";
import UserView from "./pages/UserView";
import ConversationAnalysis from "./pages/ConversationAnalysis";
import DualConversationAnalysis from "./pages/DualConversationAnalysis";
import StaticConversationView from "./pages/StaticConversationView";
import StaticTranscriptView from "./pages/StaticTranscriptView";
import SessionView from "./pages/SessionView";
import SessionAnalysis from "./pages/SessionAnalysis";
import DualConversationPage from "./pages/DualConversationPage";
import PresentationView from "./pages/PresentationView";
import PresentationEditor from "./pages/PresentationEditor";
import GroupBoardAdminPage from "./pages/GroupBoardAdminPage";
import AuthPage from "./pages/auth-page";
import OnboardingPage from "./pages/OnboardingPage";
import SettingsPage from "./pages/SettingsPage";
import ResetPasswordPage from "./pages/reset-password-page";
import LandingPage from "./pages/LandingPage";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import ImportSessionPage from "./pages/ImportSessionPage";
import { AuthProvider } from "./hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { ProtectedRoute } from "./lib/protected-route";
import CookieConsentBanner from "./components/CookieConsentBanner";

function App() {
  return (
    <AuthProvider>
      <CookieConsentBanner />
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/import/:token" component={ImportSessionPage} />
        <Route path="/privacypolicy" component={PrivacyPolicy} />
        <Route path="/terms" component={TermsOfService} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <ProtectedRoute path="/onboarding" component={OnboardingPage} />
        <ProtectedRoute path="/settings" component={SettingsPage} />
        <ProtectedRoute path="/dashboard" component={Home} />
        <Route path="/chat" component={UserView} />
        <ProtectedRoute path="/group-board/:id" component={GroupBoardAdminPage} />
        <Route path="/dual-conversation/:id" component={DualConversationPage} />
        <ProtectedRoute path="/analysis" component={ConversationAnalysis} />
        <ProtectedRoute path="/dual-analysis" component={DualConversationAnalysis} />
        <Route path="/session" component={SessionView} />
        <Route path="/present" component={PresentationView} />
        <ProtectedRoute path="/presentations/:id/edit" component={PresentationEditor} />
        <ProtectedRoute path="/session-analysis" component={SessionAnalysis} />
        <Route path="/conversation" component={StaticConversationView} />
        <Route path="/transcript/:configId/:sessionId" component={StaticTranscriptView} />
        <Route component={NotFound} />
      </Switch>
    </AuthProvider>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
          </div>
          <p className="mt-4 text-sm text-gray-600">
            The requested page could not be found.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default App;