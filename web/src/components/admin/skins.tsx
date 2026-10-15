import { CompassIcon, InfoIcon, MoonIcon, ShareIcon, SunIcon } from "lucide-react";
import { useRef } from "react";
import { useStore } from "zustand";

import { selectEnabledSkinEntries, selectSkinBusy, type SkinsController } from "@/admin/skins-controller";
import type { AdminMessages } from "@/i18n/admin-messages";
import type { SkinCatalogEntry } from "@/services/skin-catalog";

// 旧 AdminSkins.vue 平价。上传经皮肤包导入校验（skin-pack），replace/remove 确认在控制器层。
export function AdminSkins({ model, messages }: {
  model: SkinsController;
  messages: AdminMessages;
}) {
  const { tr } = messages;
  const state = useStore(model.store);
  const { entries, loading, uploading, removingId, defaultId, error, notice } = state;
  const busy = selectSkinBusy(state);
  const enabledEntries = selectEnabledSkinEntries(state);
  const skinFileInput = useRef<HTMLInputElement | null>(null);

  const skinName = (skin: SkinCatalogEntry): string => {
    if (skin.id === "builtin.light") return tr("skinDay");
    if (skin.id === "builtin.dark") return tr("skinNight");
    return skin.name;
  };
  const skinDescription = (skin: SkinCatalogEntry): string => {
    if (skin.id === "builtin.light") return tr("skinDayDescription");
    if (skin.id === "builtin.dark") return tr("skinNightDescription");
    return skin.description || "";
  };

  return (
    <section className="page-content skin-library-page">
      <div className="page-heading">
        <div>
          <h2>{tr("skinLibrary")}</h2>
          <p>{tr("skinLibraryLead")}</p>
        </div>
        <button className="primary-button" type="button" disabled={busy} onClick={() => skinFileInput.current?.click()}>
          {uploading ? <span className="spinner small" aria-hidden="true" /> : <ShareIcon size={16} aria-hidden="true" />}
          {uploading ? tr("skinUploading") : tr("skinUpload")}
        </button>
      </div>
      <input
        ref={skinFileInput}
        className="skin-file-input"
        type="file"
        accept=".wskin,application/zip"
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          if (file) void model.uploadSkin(file, () => { input.value = ""; });
          else input.value = "";
        }}
      />
      <div className="alert info skin-library-scope">
        <InfoIcon size={16} aria-hidden="true" />
        <span>{tr("skinLibraryScope")}</span>
      </div>
      <section className="skin-default-control">
        <div>
          <strong>{tr("skinDefault")}</strong>
          <p>{tr("skinDefaultLead")}</p>
        </div>
        <select value={defaultId} disabled={loading || busy} aria-label={tr("skinDefault")}
          onChange={(event) => { model.setDefaultId(event.target.value); void model.saveSkinDefault(); }}>
          {enabledEntries.map((skin) => (
            <option key={skin.id} value={skin.id}>{skinName(skin)}</option>
          ))}
        </select>
      </section>
      {error && <div className="alert error" role="alert">{error}</div>}
      {notice && <div className="alert success" role="status">{notice}</div>}
      {loading ? (
        <div className="skin-library-loading"><span className="spinner" aria-hidden="true" />{tr("loading")}</div>
      ) : entries.length > 0 ? (
        <div className="skin-library-grid">
          {entries.map((skin) => (
            <article key={skin.id} className="skin-library-card">
              <div className={`skin-preview skin-preview--${skin.previewKind || "custom"}`}>
                {skin.previewUrl ? (
                  <img src={skin.previewUrl} alt={skinName(skin)} />
                ) : (
                  <span>{skin.previewKind === "night" ? <MoonIcon size={28} aria-hidden="true" /> : <SunIcon size={28} aria-hidden="true" />}</span>
                )}
                <small>v{skin.version}</small>
                {skin.builtIn && <b className="skin-builtin-badge">{tr("skinBuiltin")}</b>}
              </div>
              <div className="skin-library-copy">
                <div className="skin-library-title">
                  <h3>{skinName(skin)}</h3>
                  <span>{skin.id}</span>
                </div>
                {skinDescription(skin) && <p>{skinDescription(skin)}</p>}
                <dl>
                  <div><dt>{tr("skinAuthor")}</dt><dd>{skin.author}</dd></div>
                  <div><dt>{tr("skinLicense")}</dt><dd>{skin.license}</dd></div>
                  <div><dt>{tr("skinMinVersion")}</dt><dd>{skin.minAppVersion}</dd></div>
                </dl>
                <div className="skin-library-actions">
                  {skin.previewUrl && (
                    <a href={skin.previewUrl} target="_blank" rel="noreferrer" className="text-link">{tr("skinPreview")}</a>
                  )}
                  {!skin.builtIn ? (
                    <label className="skin-enabled-control">
                      <span>{skin.enabled === false ? tr("skinDisabled") : tr("skinEnabled")}</span>
                      <input type="checkbox" checked={skin.enabled !== false} disabled={busy}
                        onClick={(event) => { event.preventDefault(); void model.toggleSkinEnabled(skin); }} />
                    </label>
                  ) : (
                    <span className="skin-protected-label">{tr("skinProtected")}</span>
                  )}
                  {!skin.builtIn && (
                    <button className="text-danger" type="button" disabled={busy} onClick={() => void model.removeSkin(skin)}>
                      {removingId === skin.id ? tr("skinRemoving") : tr("skinRemove")}
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="skin-library-empty">
          <span><CompassIcon size={24} aria-hidden="true" /></span>
          <strong>{tr("skinEmpty")}</strong>
          <p>{tr("skinEmptyLead")}</p>
        </div>
      )}
    </section>
  );
}
