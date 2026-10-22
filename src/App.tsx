import { BrowserRouter, HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { HASH_MODE } from "./lib/env";
import { SiteProvider } from "./site/SiteContext";
import { SiteLayout } from "./site/SiteLayout";
import { Home } from "./site/pages/Home";
import { Booking } from "./site/pages/Booking";
import { AuthProvider } from "./admin/AuthContext";
import { AdminLayout } from "./admin/AdminLayout";
import { ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage } from "./admin/pages/AuthPages";
import { Dashboard } from "./admin/pages/Dashboard";
import { Agenda } from "./admin/pages/Agenda";
import { Disponibilidade } from "./admin/pages/Disponibilidade";
import { Servicos } from "./admin/pages/Servicos";
import { Financeiro } from "./admin/pages/Financeiro";
import { Clientes } from "./admin/pages/Clientes";
import { Configuracoes } from "./admin/pages/Configuracoes";
import { Usuarios } from "./admin/pages/Usuarios";
import { Atividades } from "./admin/pages/Atividades";
import { MinhaConta } from "./admin/pages/MinhaConta";
import { Backdrop, ToastProvider } from "./components/ui";

const Router = HASH_MODE ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <Router>
      <SiteProvider>
        <AuthProvider>
          <ToastProvider>
            <Backdrop />
            <Routes>
              <Route element={<SiteLayout />}>
                <Route index element={<Home />} />
                <Route path="agendar" element={<Booking />} />
              </Route>
              <Route path="admin/login" element={<LoginPage />} />
              <Route path="admin/cadastro" element={<SignupPage />} />
              <Route path="admin/esqueci-senha" element={<ForgotPasswordPage />} />
              <Route path="admin/redefinir-senha" element={<ResetPasswordPage />} />
              <Route path="admin" element={<AdminLayout />}>
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="agenda" element={<Agenda />} />
                <Route path="disponibilidade" element={<Disponibilidade />} />
                <Route path="servicos" element={<Servicos />} />
                <Route path="financeiro" element={<Financeiro />} />
                <Route path="clientes" element={<Clientes />} />
                <Route path="configuracoes" element={<Configuracoes />} />
                <Route path="usuarios" element={<Usuarios />} />
                <Route path="atividades" element={<Atividades />} />
                <Route path="minha-conta" element={<MinhaConta />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </SiteProvider>
    </Router>
  );
}
