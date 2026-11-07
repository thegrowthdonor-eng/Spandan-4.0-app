"use client";
import { useEffect, useRef, useState } from "react";
import { compressPosterFile } from "@/lib/poster-compressor";
import { formatFileSize } from "@/lib/image-compressor";

export function PosterPicker({ currentUrl, selectedFile, onChange, onRemove, onBusy }: { currentUrl:string|null; selectedFile:File|null; onChange:(file:File)=>void; onRemove:()=>void; onBusy:(busy:boolean)=>void }) {
  const image=useRef<HTMLImageElement>(null);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    const url=selectedFile?URL.createObjectURL(selectedFile):null;
    if(image.current&&url)image.current.src=url;
    return()=>{if(url)URL.revokeObjectURL(url);};
  },[selectedFile]);
  async function choose(file?:File){
    if(!file)return;
    setBusy(true);onBusy(true);setMessage("Optimizing poster…");
    try{const result=await compressPosterFile(file);onChange(result.file);setMessage(`${formatFileSize(result.originalSize)} → ${formatFileSize(result.compressedSize)} · WebP · uploads on final save`);}
    catch(e){setMessage(e instanceof Error?e.message:"Could not prepare this image. Try JPEG or PNG.");}
    finally{setBusy(false);onBusy(false);if(input.current)input.current.value="";}
  }
  return <section className="portal-poster" aria-label="Event poster"><h2>Event poster <small>(optional)</small></h2><p>Choose now, preview before saving. Optimized WebP; 150–300 KB target, maximum 500 KB.</p>
    <input ref={input} type="file" accept="image/*" hidden aria-label="Choose event poster file" onChange={e=>void choose(e.target.files?.[0])} disabled={busy}/>
    <button type="button" className="portal-secondary" onClick={()=>input.current?.click()} disabled={busy}>{busy?"Compressing…":selectedFile||currentUrl?"Replace poster":"Choose poster from device"}</button>
    {(selectedFile||currentUrl)&&<>
      {/* Local blob previews are assigned through the browser image element. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={image} src={currentUrl??undefined} width={1200} height={1600} alt="Event poster preview" className="portal-preview"/>
      <button type="button" className="portal-secondary" onClick={()=>{setMessage("");onRemove();}} disabled={busy}>Remove poster</button></>}
    <p role="status">{message|| (selectedFile?`${formatFileSize(selectedFile.size)} · WebP · uploads on final save`:"")}</p>
  </section>;
}
