import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import DataImport from './pages/DataImport';
import ClinicianLogin from './pages/ClinicianLogin';
import ClientLogin from './pages/ClientLogin';
import ParentLogin from './pages/ParentLogin';
import ClientDashboard from './pages/ClientDashboard';
import ParentDashboard from './pages/ParentDashboard';
import UploadBehaviorPlan from './pages/UploadBehaviorPlan';
import RoleSetup from './pages/RoleSetup';
import ClientDetail from './pages/ClientDetail';
import ChildProfile from './pages/ChildProfile';
import ClinicianUsers from './pages/ClinicianUsers';
import Settings from './pages/Settings';
import HelpNow from './pages/HelpNow';
import LogBehavior from './pages/LogBehavior';
import DocumentCenter from './pages/DocumentCenter';
import RewardTracker from './pages/RewardTracker';
import Messages from './pages/Messages';
import InterventionBuilder from './pages/InterventionBuilder';
import ProgressReports from './pages/ProgressReports';
import ClinicianDocuments from './pages/ClinicianDocuments';
import FamilyDetail from './pages/FamilyDetail';
import AIChat from './pages/AIChat';
import UsernameLogin from './pages/UsernameLogin';
import GoalsMilestones from './pages/GoalsMilestones';
import ParentUpload from './pages/ParentUpload';
import ParentSignup from './pages/ParentSignup';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/ClinicianLogin" element={<ClinicianLogin />} />
      <Route path="/ParentLogin" element={<ParentLogin />} />
      <Route path="/ClientLogin" element={<ClientLogin />} />
      <Route path="/ClientDashboard" element={<LayoutWrapper currentPageName="ClientDashboard"><ClientDashboard /></LayoutWrapper>} />
      <Route path="/ParentDashboard" element={<LayoutWrapper currentPageName="ParentDashboard"><ParentDashboard /></LayoutWrapper>} />
      <Route path="/UploadBehaviorPlan" element={<LayoutWrapper currentPageName="UploadBehaviorPlan"><UploadBehaviorPlan /></LayoutWrapper>} />
      <Route path="/RoleSetup" element={<RoleSetup />} />
      <Route path="/ClientDetail" element={<LayoutWrapper currentPageName="ClientDetail"><ClientDetail /></LayoutWrapper>} />
      <Route path="/ChildProfile" element={<LayoutWrapper currentPageName="ChildProfile"><ChildProfile /></LayoutWrapper>} />
      <Route path="/ClinicianUsers" element={<LayoutWrapper currentPageName="ClinicianUsers"><ClinicianUsers /></LayoutWrapper>} />
      <Route path="/Settings" element={<LayoutWrapper currentPageName="Settings"><Settings /></LayoutWrapper>} />
      <Route path="/HelpNow" element={<HelpNow />} />
      <Route path="/LogBehavior" element={<LayoutWrapper currentPageName="LogBehavior"><LogBehavior /></LayoutWrapper>} />
      <Route path="/DocumentCenter" element={<LayoutWrapper currentPageName="DocumentCenter"><DocumentCenter /></LayoutWrapper>} />
      <Route path="/RewardTracker" element={<LayoutWrapper currentPageName="RewardTracker"><RewardTracker /></LayoutWrapper>} />
      <Route path="/Messages" element={<LayoutWrapper currentPageName="Messages"><Messages /></LayoutWrapper>} />
      <Route path="/InterventionBuilder" element={<LayoutWrapper currentPageName="InterventionBuilder"><InterventionBuilder /></LayoutWrapper>} />
      <Route path="/ProgressReports" element={<LayoutWrapper currentPageName="ProgressReports"><ProgressReports /></LayoutWrapper>} />
      <Route path="/ClinicianDocuments" element={<LayoutWrapper currentPageName="ClinicianDocuments"><ClinicianDocuments /></LayoutWrapper>} />
      <Route path="/FamilyDetail" element={<LayoutWrapper currentPageName="FamilyDetail"><FamilyDetail /></LayoutWrapper>} />
      <Route path="/AIChat" element={<LayoutWrapper currentPageName="AIChat"><AIChat /></LayoutWrapper>} />
      <Route path="/UsernameLogin" element={<UsernameLogin />} />
      <Route path="/ParentUpload" element={<ParentUpload />} />
      <Route path="/ParentSignup" element={<ParentSignup />} />
      <Route path="/GoalsMilestones" element={<LayoutWrapper currentPageName="GoalsMilestones"><GoalsMilestones /></LayoutWrapper>} />
      <Route path="/DataImport" element={<DataImport />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App