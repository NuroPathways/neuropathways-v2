import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Baby,
  ChevronDown,
  ChevronRight,
  LifeBuoy,
  LogOut,
  Menu,
  MoreHorizontal,
  X,
} from "lucide-react";
import BrandMark from "@/components/brand/BrandMark";
import "./role-aware-navigation.css";
import "./legacy-skin.css";
import {
  activateNavigationItem,
  canChooseNavigationChild,
  getMobileNavigationItems,
} from "./navigationModels";

const displayName = (person) =>
  person?.child_name || person?.childName || person?.name || "Child";

function NavigationLink({ item, active, variant, closeMenu }) {
  const Icon = item.icon || ChevronRight;
  const className = [
    "np-nav-item",
    `np-nav-item-${variant}`,
    item.support ? "np-nav-item-support" : "",
    active ? "is-active" : "",
  ].filter(Boolean).join(" ");
  const content = (
    <>
      <Icon aria-hidden="true" size={variant === "bottom" ? 19 : 16} strokeWidth={active ? 2.25 : 1.8} />
      <span>{item.label}</span>
      {item.badge && <span className="np-nav-badge">{item.badge}</span>}
      {active && variant === "desktop" && <ChevronRight className="np-nav-current" aria-hidden="true" size={13} />}
    </>
  );
  const sharedProps = {
    className,
    "aria-current": active ? "page" : undefined,
    "aria-disabled": item.disabled || undefined,
    "data-testid": `nav-${item.key}-${variant}`,
    onClick: () => activateNavigationItem(item, closeMenu),
  };

  if (item.to) {
    return <Link {...sharedProps} to={typeof item.to === "function" ? item.to() : item.to}>{content}</Link>;
  }
  return <button {...sharedProps} type="button" disabled={Boolean(item.disabled)}>{content}</button>;
}

function ChildContext({ childrenOptions, selectedChild, contextLabel, onChildSelect, compact = false }) {
  const canChoose = canChooseNavigationChild(childrenOptions, onChildSelect);
  if (!selectedChild && !canChoose) return null;

  return (
    <label className={`np-nav-context-control ${compact ? "is-compact" : ""}`}>
      <span>{contextLabel || "Viewing support for"}</span>
      {canChoose ? (
        <span className="np-nav-select-wrap">
          <select
            aria-label={contextLabel || "Choose a child profile"}
            value={selectedChild?.id || ""}
            onChange={(event) => onChildSelect(event.target.value)}
            data-testid={`select-navigation-child-${compact ? "mobile" : "desktop"}`}
          >
            {childrenOptions.map((child) => (
              <option key={child.id} value={child.id}>{displayName(child)}</option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" size={13} />
        </span>
      ) : (
        <strong>{displayName(selectedChild)}</strong>
      )}
    </label>
  );
}

export default function RoleAwareShell({
  role = "caregiver",
  roleLabel,
  currentLabel,
  activeKey,
  navGroups = [],
  mobilePrimaryKeys = [],
  accountName = "Account",
  accountMeta,
  selectedChild,
  childrenOptions = [],
  contextLabel,
  onChildSelect,
  onLogout,
  headerActions,
  legacyAppearance = false,
  showChildLinks = false,
  hideTopbar = false,
  children,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const allItems = navGroups.flatMap((group) => group.items);
  const activeItem = allItems.find((item) => item.key === activeKey || item.active);
  const pageLabel = currentLabel || activeItem?.label || "Home";
  const mobileItems = getMobileNavigationItems(navGroups, mobilePrimaryKeys);
  const initials = String(accountName || "A").trim().charAt(0).toUpperCase() || "A";

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  const closeMenu = () => setMobileOpen(false);

  const navigation = (variant) => (
    <nav className={`np-nav-groups np-nav-groups-${variant}`} aria-label="Main navigation">
      {navGroups.map((group, index) => (
        <section className="np-nav-group" key={group.label || index}>
          {group.label && <h2>{group.label}</h2>}
          {group.items.map((item) => (
            <NavigationLink
              key={item.key}
              item={item}
              active={item.key === activeKey || Boolean(item.active)}
              variant={variant}
              closeMenu={closeMenu}
            />
          ))}
          {showChildLinks && index === 0 && childrenOptions.length > 0 && (
            <section className="np-nav-children" aria-label="Children">
              <h2>Children</h2>
              {childrenOptions.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  className={`np-nav-child-link ${selectedChild?.id === child.id ? "is-selected" : ""}`}
                  onClick={() => { onChildSelect?.(child.id); closeMenu(); }}
                  aria-pressed={selectedChild?.id === child.id}
                  data-testid={`button-navigation-child-${child.id}`}
                >
                  <Baby size={15} aria-hidden="true" />
                  <span>{displayName(child)}</span>
                </button>
              ))}
            </section>
          )}
        </section>
      ))}
    </nav>
  );

  const account = (surface) => (
    <div className="np-nav-account">
      <span className="np-nav-avatar" aria-hidden="true">{initials}</span>
      <span className="np-nav-account-copy">
        <strong>{accountName}</strong>
        {accountMeta && <small>{accountMeta}</small>}
      </span>
      {onLogout && (
        <button
          className="np-nav-logout"
          type="button"
          onClick={onLogout}
          aria-label="Sign out"
          data-testid={`button-navigation-logout-${surface}`}
        >
          <LogOut size={16} aria-hidden="true" />
          <span>Sign out</span>
        </button>
      )}
    </div>
  );

  return (
    <div className={`np-nav-shell np-nav-role-${role}${legacyAppearance ? " np-legacy" : ""}${hideTopbar ? " np-nav-hide-topbar" : ""}`}>
      <aside className="np-nav-sidebar">
        <div className="np-nav-brand">
          <span className="np-nav-brand-mark"><BrandMark size={30} /></span>
          <span><strong>NeuroPathways</strong><small>{roleLabel || "Workspace"}</small></span>
        </div>
        {selectedChild && !showChildLinks && (
          <div className="np-nav-sidebar-context">
            <span className="np-nav-context-mark" aria-hidden="true"><LifeBuoy size={16} /></span>
            <span><small>{contextLabel || "Viewing support for"}</small><strong>{displayName(selectedChild)}</strong></span>
          </div>
        )}
        {navigation("desktop")}
        {account("sidebar")}
      </aside>

      <div className="np-nav-workspace">
        <header className="np-nav-mobile-header">
          <button
            type="button"
            className="np-nav-menu-toggle"
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
            data-testid="button-navigation-menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="np-nav-mobile-brand"><BrandMark size={25} />NeuroPathways</span>
          <span className="np-nav-mobile-role">{roleLabel || "Workspace"}</span>
          {(childrenOptions.length > 1 || selectedChild) && (
            <ChildContext
              childrenOptions={childrenOptions}
              selectedChild={selectedChild}
              contextLabel={contextLabel}
              onChildSelect={onChildSelect}
              compact
            />
          )}
        </header>

        <header className="np-nav-topbar">
          <div className="np-nav-breadcrumb">
            <span>Workspace</span><ArrowRight size={12} aria-hidden="true" /><strong>{pageLabel}</strong>
          </div>
          <div className="np-nav-topbar-actions">
            {(childrenOptions.length > 1 || selectedChild) && (
              <ChildContext
                childrenOptions={childrenOptions}
                selectedChild={selectedChild}
                contextLabel={contextLabel}
                onChildSelect={onChildSelect}
              />
            )}
            {headerActions}
            <span className="np-nav-topbar-account">
              <span className="np-nav-avatar" aria-hidden="true">{initials}</span>
              <span>{accountName}</span>
            </span>
          </div>
        </header>

        <main className="np-nav-main">{children}</main>
      </div>

      {mobileOpen && (
        <>
          <button
            className="np-nav-backdrop"
            type="button"
            aria-label="Close navigation menu"
            onClick={closeMenu}
            data-testid="button-navigation-backdrop"
          />
          <aside className="np-nav-mobile-drawer" aria-label={`${roleLabel || "Workspace"} navigation`}>
            <div className="np-nav-drawer-heading">
              <span className="np-nav-brand-mark"><BrandMark size={30} /></span>
              <span><strong>NeuroPathways</strong><small>{roleLabel || "Workspace"}</small></span>
              <button type="button" className="np-nav-drawer-close" aria-label="Close navigation menu" onClick={closeMenu}>
                <X size={18} />
              </button>
            </div>
            {selectedChild && (
              <div className="np-nav-sidebar-context">
                <span className="np-nav-context-mark" aria-hidden="true"><LifeBuoy size={16} /></span>
                <span><small>{contextLabel || "Viewing support for"}</small><strong>{displayName(selectedChild)}</strong></span>
              </div>
            )}
            {navigation("mobile")}
            {account("drawer")}
          </aside>
        </>
      )}

      <nav className="np-nav-bottom" aria-label="Quick navigation">
        {mobileItems.map((item) => (
          <NavigationLink
            key={item.key}
            item={item}
            active={item.key === activeKey || Boolean(item.active)}
            variant="bottom"
            closeMenu={closeMenu}
          />
        ))}
        <button
          className={`np-nav-item np-nav-item-bottom ${mobileOpen ? "is-active" : ""}`}
          type="button"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          data-testid="button-navigation-more"
        >
          <MoreHorizontal size={20} aria-hidden="true" /><span>More</span>
        </button>
      </nav>
    </div>
  );
}
