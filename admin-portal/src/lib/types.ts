export type MePayload = {
  user: {
    id: string;
    email: string;
    name: string;
    systemLevel: string;
    isSystemUser: boolean;
    disabled: boolean;
  };
  roles: Array<{
    id: string;
    name: string;
    description: string;
    systemLevel: string;
    isSystemRole: boolean;
    visibleMenusConfigured: boolean;
    visibleMenus: string[];
  }>;
  permissions: string[];
  visibleMenus: string[];
  visibleMenusConfigured: boolean;
  systemLevel: string;
};

export type MenuItem = {
  id: string;
  href: string;
  label: string;
  anyOf: string[];
};
