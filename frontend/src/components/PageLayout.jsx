import React from "react";
import { NavLink } from "react-router-dom";
import { Package, User } from "lucide-react";
import { Theme, Container } from "@radix-ui/themes";
import NavLinks from "../assets/navlinks";

export const PageLayout = ({ children }) => {
  return (
    <Theme accentColor="indigo" grayColor="slate" panelBackground="translucent">
      <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans">

        {/* ========================================================= */}
        {/* MOBILE LAYOUT HEADER (Visible only on mobile)             */}
        {/* ========================================================= */}
        <header className="md:hidden flex h-16 items-center justify-between px-4 bg-white border-b border-slate-150 shadow-sm">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-blue-600 rounded-lg text-white">
              <Package className="w-5 h-5" />
            </div>
            <span className="font-bold text-slate-800 tracking-tight text-md">
              VeriFlow
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-500">Warehouse Operator</span>
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 border border-slate-200">
              <User className="w-4 h-4" />
            </div>
          </div>
        </header>

        {/* ========================================================= */}
        {/* MOBILE LAYOUT SUB-MENU BUTTONS (Horizontal Inline Div)   */}
        {/* ========================================================= */}
        <div className="md:hidden w-full bg-white border-b border-slate-150 p-2">
          <div className="grid grid-cols-3 gap-2">
            {NavLinks.map((link) => {
              const Icon = link.icon;
              return (
                <NavLink
                  key={link.path}
                  to={link.path}
                  className={({ isActive }) =>
                    `flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[10px] font-bold transition-all border ${isActive
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                      : "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800 border-slate-200"
                    }`
                  }
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{link.name}</span>
                </NavLink>
              );
            })}
          </div>
        </div>

        {/* ========================================================= */}
        {/* DESKTOP LAYOUT (Sidebar + Main Panel)                     */}
        {/* ========================================================= */}
        <div className="flex-1 flex flex-row">

          {/* LEFT DESKTOP SIDEBAR */}
          <aside className="hidden md:flex flex-col w-60 bg-white border-r border-slate-200 fixed top-0 bottom-0 left-0 z-40 select-none">
            {/* Logo */}
            <div className="flex h-16 items-center space-x-2.5 px-6 border-b border-slate-100">
              <div className="p-2 bg-blue-600 rounded-lg text-white">
                <Package className="w-5 h-5" />
              </div>
              <span className="font-bold text-slate-800 tracking-tight text-lg">
                VeriFlow
              </span>
            </div>

            {/* Navigation links list */}
            <nav className="flex-1 px-4 py-6 space-y-1.5">
              {NavLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <NavLink
                    key={link.path}
                    to={link.path}
                    className={({ isActive }) =>
                      `flex items-center gap-3.5 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${isActive
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span>{link.name}</span>
                  </NavLink>
                );
              })}
            </nav>

            {/* Bottom Profile Details */}
            <div className="p-4 border-t border-slate-100">
              <div className="flex items-center gap-3 p-2 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 flex-shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 leading-none truncate">
                    Warehouse Operator
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium leading-none mt-1 truncate">
                    operator@warehouse.io
                  </p>
                </div>
              </div>
            </div>
          </aside>

          {/* MAIN CONTENT AREA */}
          <div className="flex-1 flex flex-col md:ml-60">

            {/* Desktop Top Header Bar (Floating right) */}
            <header className="hidden md:flex h-16 items-center justify-end px-8 bg-white shadow-md w-auto sticky top-0 z-30 select-none">
              <div className="flex items-center space-x-3">
                <span className="text-sm font-semibold text-slate-600">Warehouse Operator</span>
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 border border-slate-200">
                  <User className="w-4 h-4" />
                </div>
              </div>
            </header>

            {/* Active Content wrapper */}
            <main className="flex-1 p-4 md:p-8 bg-slate-50/50">
              <Container size="4" className="mx-auto">
                <div className="w-full animate-fade-in">
                  {children}
                </div>
              </Container>
            </main>

            {/* Responsive Footer */}
            <footer className="py-5 border-t border-slate-100 bg-white">
              <p className="text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                &copy; {new Date().getFullYear()} VeriFlow Ops. All rights reserved.
              </p>
            </footer>

          </div>
        </div>

      </div>
    </Theme>
  );
};

export default PageLayout;
