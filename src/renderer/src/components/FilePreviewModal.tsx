import { useEffect, useState } from 'react'
import {
  Copy,
  Download,
  ExternalLink,
  FileQuestion,
  ImageOff,
  Loader2,
  RefreshCw,
  TriangleAlert
} from 'lucide-react'
import { toast } from 'sonner'
import type { PreviewResult, RemoteItem } from '@shared/types'
import { formatBytes } from '../lib/utils'
import { Modal } from './Modal'
import { fileCategory, FileGlyph } from './Visuals'

export function FilePreviewModal({
  item,
  onClose
}: {
  item: RemoteItem | null
  onClose: () => void
}): React.JSX.Element | null {
  const [result, setResult] = useState<PreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!item) {
      setResult(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setResult(null)
    window.api
      .previewItem({ name: item.name, path: item.path, isDir: item.isDir })
      .then((preview) => {
        if (!cancelled) setResult(preview)
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message.replace(/^Error invoking remote method '[^']+':\s*/i, '')
              : String(cause)
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [item])

  if (!item) return null

  const download = async (): Promise<void> => {
    const localDir = await window.api.pickLocalFolder()
    if (!localDir) return
    setDownloading(true)
    try {
      await window.api.downloadItems(
        [{ name: item.name, path: item.path, isDir: item.isDir }],
        localDir
      )
      toast.success('已开始下载', { description: item.name })
      onClose()
    } catch (cause) {
      toast.error('下载失败', {
        description:
          cause instanceof Error
            ? cause.message.replace(/^Error invoking remote method '[^']+':\s*/i, '')
            : String(cause)
      })
    } finally {
      setDownloading(false)
    }
  }

  const openWithSystem = async (): Promise<void> => {
    try {
      await window.api.openItem({ name: item.name, path: item.path, isDir: item.isDir })
    } catch (cause) {
      toast.error('无法打开文件', {
        description: cause instanceof Error ? cause.message : String(cause)
      })
    }
  }

  const retry = (): void => {
    if (!item) return
    setLoading(true)
    setError(null)
    window.api
      .previewItem({ name: item.name, path: item.path, isDir: item.isDir })
      .then(setResult)
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setLoading(false))
  }

  return (
    <Modal
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{item.name}</span>
        </span>
      }
      subtitle={
        <span className="flex items-center gap-2">
          <FileGlyph name={item.name} size="sm" />
          {formatBytes(item.size)}
          {item.modTime ? <span>· {new Date(item.modTime).toLocaleString('zh-CN')}</span> : null}
        </span>
      }
      onClose={onClose}
      widthClass="max-w-[900px]"
      bodyClass="!p-0"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            关闭
          </button>
          <button type="button" className="btn" onClick={() => void openWithSystem()}>
            <ExternalLink size={13} />
            用默认应用打开
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void download()}
            disabled={downloading}
          >
            {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            保存到本地
          </button>
        </>
      }
    >
      <div className="min-h-[300px] max-h-[66vh] overflow-auto bg-[var(--input-bg)]">
        {loading ? (
          <div className="flex h-[340px] flex-col items-center justify-center gap-3 text-[12px] text-[var(--text-muted)]">
            <Loader2 size={22} className="animate-spin text-sky-400" />
            正在读取文件内容…
          </div>
        ) : error ? (
          <div className="flex h-[340px] flex-col items-center justify-center gap-3 px-8 text-center">
            <TriangleAlert size={26} className="text-[var(--danger-text)]" />
            <div className="max-w-[520px] break-words text-[12px] leading-relaxed text-[var(--text-soft)]">
              {error}
            </div>
            <button type="button" className="btn btn-sm" onClick={retry}>
              <RefreshCw size={12} />
              重试
            </button>
          </div>
        ) : result?.kind === 'text' ? (
          <div>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--panel-solid)]/95 px-4 py-2 backdrop-blur">
              <span className="text-[10.5px] text-[var(--text-muted)]">
                纯文本预览 · {formatBytes(result.size)}
                {result.truncated ? '（仅显示前 512 KB）' : ''}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  void window.api.copyText(result.text)
                  toast.success('文本已复制')
                }}
              >
                <Copy size={12} />
                复制全部
              </button>
            </div>
            <pre className="selectable whitespace-pre-wrap break-words px-5 py-4 font-mono text-[11.5px] leading-relaxed text-[var(--text-soft)]">
              {result.text || '（空文件）'}
            </pre>
          </div>
        ) : result?.kind === 'image' ? (
          <div className="flex min-h-[340px] items-center justify-center p-5">
            <img
              src={result.dataUrl}
              alt={result.name}
              className="max-h-[58vh] max-w-full rounded-lg border border-[var(--border)] object-contain shadow-2xl"
            />
          </div>
        ) : result?.kind === 'unsupported' ? (
          <div className="flex h-[340px] flex-col items-center justify-center gap-4 text-center">
            <span className="empty-icon !h-[64px] !w-[64px]">
              {fileCategory(item.name) === 'image' ? <ImageOff size={24} /> : <FileQuestion size={24} />}
            </span>
            <div>
              <div className="text-[13px] font-medium text-[var(--text)]">
                此文件暂不支持内置预览
              </div>
              <div className="mt-1 text-[11.5px] text-[var(--text-muted)]">
                {result.mimeType || '未知类型'} · {formatBytes(result.size)}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-sm" onClick={() => void openWithSystem()}>
                <ExternalLink size={12} />
                用默认应用打开
              </button>
              <button type="button" className="btn btn-sm btn-soft" onClick={() => void download()}>
                <Download size={12} />
                下载到本地
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
