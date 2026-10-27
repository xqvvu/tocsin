import { Tabs, TabsContent } from "#/components/ui/tabs";
import { settingsUiPanelClassName } from "#/features/configuration/model/settings-layout";
import { ImportNoticePanel } from "#/features/configuration/ui/import-notice-panel";
import { PortableConfigForm } from "#/features/configuration/ui/portable-config-form";
import { SettingsDeliveryPausePanel } from "#/features/configuration/ui/settings-delivery-pause-panel";
import { SettingsOperationalOverview } from "#/features/configuration/ui/settings-operational-overview";
import { SettingsPageToolbar } from "#/features/configuration/ui/settings-page-toolbar";
import { SettingsPreferencesPanel } from "#/features/configuration/ui/settings-preferences-panel";
import { SettingsRuntimePanel } from "#/features/configuration/ui/settings-runtime-panel";
import { SettingsSecurityPanel } from "#/features/configuration/ui/settings-security-panel";
import { SettingsStoragePanel } from "#/features/configuration/ui/settings-storage-panel";
import { SettingsWorkerHealthPanel } from "#/features/configuration/ui/settings-worker-health-panel";
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
            <div className="min-h-0 shrink-0">
              <ImportNoticePanel
                notice={workspace.importNotice}
                onDismiss={workspace.dismissImportNotice}
              />
            </div>
          ) : null}
          <TabsContent value="ui" className={settingsUiPanelClassName}>
            <SettingsOperationalOverview />
            <SettingsDeliveryPausePanel />
            <SettingsSecurityPanel />
            <SettingsRuntimePanel />
            <SettingsWorkerHealthPanel />
            <SettingsStoragePanel />
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
