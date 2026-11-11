export const mediaColumns = { events:["poster_url"], result_publications:["podium_photo_url"],sponsors:["logo_url"],merchandise_items:["image_url"],organiser_profiles:["photo_url"],media_items:["asset_url","thumbnail_url"],gallery_moments:["storage_path"] } as const;
export type MediaReference={table:keyof typeof mediaColumns;id:string;column:string;original:string};
export type MediaMigrationItem={id:string;sourceUrl:string;key:string;references:MediaReference[];state:"pending"|"copied"|"verified"|"switched"|"rolled_back";targetUrl?:string;sha256?:string;originalSha256?:string;width?:number;height?:number;bytes?:number;assetId?:string};
export type MediaManifest={version:1;projectUrl:string;targetBase:string|null;createdAt:string;items:MediaMigrationItem[]};
export function validateMediaManifest(manifest:MediaManifest,projectUrl:string) {
  if (manifest.version!==1 || manifest.projectUrl!==projectUrl || !Array.isArray(manifest.items)) throw new Error("Manifest does not belong to this project.");
  const source=new URL(projectUrl);
  const ids=new Set<string>();
  for (const item of manifest.items) {
    const url=new URL(item.sourceUrl);
    if (ids.has(item.id) || url.origin!==source.origin || !url.pathname.startsWith("/storage/v1/object/public/fest-media/") || !/^[a-zA-Z0-9/_\-.]+$/.test(item.key) || item.key.split("/").includes("..")) throw new Error("Invalid or duplicate media manifest item.");
    ids.add(item.id);
    for (const ref of item.references) if (!(ref.table in mediaColumns) || !(mediaColumns[ref.table] as readonly string[]).includes(ref.column) || !/^[a-f0-9-]{36}$/i.test(ref.id)) throw new Error("Untrusted media reference.");
  }
}
