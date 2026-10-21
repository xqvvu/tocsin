import { Tabs, TabsContent } from "#/components/ui/tabs";
import { ImportNoticePanel } from "#/features/configuration/ui/import-notice-panel";
import { PortableConfigForm } from "#/features/configuration/ui/portable-config-form";
import { SettingsOperationalOverview } from "#/features/configuration/ui/settings-operational-overview";
import { SettingsPageToolbar } from "#/features/configuration/ui/settings-page-toolbar";
import { SettingsPreferencesPanel } from "#/features/configuration/ui/settings-preferences-panel";
import { SettingsRuntimePanel } from "#/features/configuration/ui/settings-runtime-panel";
import { useSettingsWorkspace } from "#/features/configuration/ui/use-settings-workspace";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export function SettingsPage() {
  const workspace = useSettingsWorkspace();

  return (
    <DashboardContentLayout
      main={
        <Tabs
          value={workspace.activeTab}
          onValueChange={workspace.setActiveTab}
          className="min-h-0 grow gap-4 overflow-hidden"
        >
          <SettingsPageToolbar
            pending={workspace.pending}
            onRefresh={() => void workspace.refresh()}
          />
          {workspace.importNotice ? (
            <div className="min-h-0">
              <ImportNoticePanel notice={workspace.importNotice} />
            </div>
          ) : null}
          <TabsContent value="ui" className="flex min-h-0 flex-col gap-4 overflow-hidden">
            <SettingsOperationalOverview />
            <SettingsRuntimePanel />
            <SettingsPreferencesPanel />
          </TabsContent>
          <TabsContent value="toml" className="min-h-0">
            {workspace.activeTab === "toml" ? (
              <PortableConfigForm
                format="toml"
                pending={workspace.pending}
                {...workspace.portable.toml}
              />
            ) : null}
          </TabsContent>
          <TabsContent value="json" className="min-h-0">
            {workspace.activeTab === "json" ? (
              <PortableConfigForm
                format="json"
                pending={workspace.pending}
                {...workspace.portable.json}
              />
            ) : null}
          </TabsContent>
        </Tabs>
      }
    />
  );
}
