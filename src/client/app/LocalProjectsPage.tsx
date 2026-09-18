import { useMemo, useState } from "react"
import { useOutletContext } from "react-router-dom"
import { DEFAULT_NEW_PROJECTS_DIRECTORY } from "../../shared/types"
import { SetupCard } from "../components/auth/SetupCard"
import { GitHubReposSection } from "../components/GitHubReposSection"
import { LocalDev } from "../components/LocalDev"
import { ProjectSectionMenu } from "../components/chat-ui/sidebar/Menus"
import { ArchivedChatsDialog } from "../components/chat-ui/sidebar/ArchivedChatsDialog"
import { useSidebarStore } from "../stores/sidebarStore"
import type { KannaState } from "./useKannaState"

export function LocalProjectsPage() {
  const state = useOutletContext<KannaState>()
  const sidebarData = useSidebarStore((store) => store.data)
  const groupsByPath = useMemo(
    () => new Map(sidebarData.projectGroups.map((group) => [group.localPath, group])),
    [sidebarData]
  )
  const [archive, setArchive] = useState<{ localPath: string; nowMs: number } | null>(null)
  const archivedGroup = archive ? groupsByPath.get(archive.localPath) : undefined

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      <LocalDev
        connectionStatus={state.connectionStatus}
        ready={state.localProjectsReady}
        snapshot={state.localProjects}
        startingLocalPath={state.startingLocalPath}
        commandError={state.commandError}
        onOpenProject={state.handleOpenLocalProject}
        renderProjectMenu={(project, card) => (
          <ProjectSectionMenu
            key={project.localPath}
            editorLabel={state.editorLabel}
            repoUrl={groupsByPath.get(project.localPath)?.repoUrl}
            onNewChat={() => { void state.handleOpenLocalProject(project.localPath) }}
            newChatDisabled={state.connectionStatus !== "connected" || state.startingLocalPath === project.localPath}
            onRename={() => { void state.handleRenameProject({ localPath: project.localPath }, project.sidebarTitle, project.title) }}
            onCopyPath={() => { void state.handleCopyPath(project.localPath) }}
            onShowArchived={() => setArchive({ localPath: project.localPath, nowMs: Date.now() })}
            onOpenInFinder={() => { void state.handleOpenExternalPath("open_finder", project.localPath) }}
            onOpenInEditor={() => { void state.handleOpenExternalPath("open_editor", project.localPath) }}
            onHide={() => { void state.handleHideProject({ localPath: project.localPath }) }}
          >
            {card}
          </ProjectSectionMenu>
        )}
        providerCards={<SetupCard className="mb-8" />}
        githubSection={
          <GitHubReposSection
            socket={state.socket}
            newProjectsDirectory={state.appSettings?.newProjectsDirectory ?? DEFAULT_NEW_PROJECTS_DIRECTORY}
            onCloneRepo={state.handleCreateProject}
          />
        }
      />
      <ArchivedChatsDialog
        open={archive !== null}
        description={archive?.localPath}
        chats={archivedGroup?.archivedChats ?? []}
        nowMs={archive?.nowMs ?? Date.now()}
        onOpenChange={(open) => { if (!open) setArchive(null) }}
        onOpenChat={(chatId) => { void state.handleOpenArchivedChat(chatId) }}
        onRestoreChat={(chatId) => { void state.handleRestoreChat(chatId) }}
      />
    </div>
  )
}
