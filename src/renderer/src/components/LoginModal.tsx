import { useState } from 'react'
import {
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  LogIn,
  RefreshCw,
  ShieldCheck,
  TriangleAlert
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '../store/app'
import { Modal } from './Modal'
import { Spinner } from './Visuals'

export function LoginModal(): React.JSX.Element | null {
  const loginOpen = useAppStore((state) => state.loginOpen)
  const loginBusy = useAppStore((state) => state.loginBusy)
  const loginState = useAppStore((state) => state.loginState)
  const closeLogin = useAppStore((state) => state.closeLogin)
  const startLogin = useAppStore((state) => state.startLogin)
  const [copied, setCopied] = useState(false)

  if (!loginOpen) return null

  const authUrl = loginState.authUrl || ''
  const waiting = loginState.status === 'waiting'
  const starting = loginState.status === 'starting'
  const failed = loginState.status === 'error'
  const success = loginState.status === 'success'

  const copyLink = async (): Promise<void> => {
    if (!authUrl) return
    await window.api.copyText(authUrl)
    setCopied(true)
    toast.success('授权链接已复制')
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <Modal
      title="连接 OneDrive"
      subtitle="使用 Microsoft 个人账户授权，OneBridge 不会接触你的账户密码。"
      icon={
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl border"
          style={{
            borderColor: 'rgba(56,189,248,.24)',
            background: 'rgba(56,189,248,.1)',
            color: 'var(--brand-text)'
          }}
        >
          <LogIn size={18} />
        </span>
      }
      onClose={closeLogin}
      widthClass="max-w-[540px]"
      closeOnBackdrop={!loginBusy}
      hideClose={false}
      footer={
        <>
          <button type="button" className="btn" onClick={closeLogin}>
            {loginBusy ? '取消登录' : '关闭'}
          </button>
          {failed ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void startLogin()}
              disabled={loginBusy}
            >
              <RefreshCw size={13} />
              重新登录
            </button>
          ) : authUrl ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void window.api.openRcloneLoginUrl()}
            >
              <ExternalLink size={13} />
              打开授权页面
            </button>
          ) : null}
        </>
      }
    >
      <div className="space-y-5">
        <div
          className="flex items-start gap-3 rounded-xl border px-4 py-3.5"
          style={{
            borderColor: failed ? 'rgba(251,113,133,.24)' : 'rgba(56,189,248,.18)',
            background: failed ? 'rgba(251,113,133,.06)' : 'rgba(56,189,248,.05)'
          }}
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--panel-2)]">
            {success ? (
              <Check size={16} className="text-emerald-400" />
            ) : failed ? (
              <TriangleAlert size={16} className="text-[var(--danger-text)]" />
            ) : (
              <Loader2 size={16} className="animate-spin text-sky-400" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold text-[var(--text)]">
              {success
                ? '授权成功'
                : failed
                  ? '登录未完成'
                  : waiting
                    ? '等待浏览器授权'
                    : '正在准备 Microsoft 登录…'}
            </div>
            <div className="mt-1 break-words text-[11.5px] leading-relaxed text-[var(--text-muted)]">
              {failed
                ? loginState.message || '请重试，或检查网络连接。'
                : waiting
                  ? '浏览器已打开 Microsoft 登录页面。完成授权后，此窗口会自动继续。'
                  : '正在启动本地安全授权服务，请稍候。'}
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          <StepRow
            index={1}
            done={waiting || success}
            active={starting}
            title="启动本地授权"
            detail="OneBridge 会使用内置 rclone 引擎发起 OAuth 授权，全程在本机完成。"
          />
          <StepRow
            index={2}
            done={success}
            active={waiting}
            title="在浏览器登录 Microsoft"
            detail="登录 outlook.com、hotmail 等个人账户，并允许 OneBridge 访问 OneDrive 文件。"
          />
          <StepRow
            index={3}
            done={success}
            active={waiting && Boolean(authUrl)}
            title="返回 OneBridge"
            detail="授权完成后会自动保存凭证并关闭此窗口，不需要手动复制令牌。"
          />
        </div>

        {authUrl ? (
          <div className="space-y-2">
            <label className="label">授权链接</label>
            <div className="flex gap-2">
              <input
                className="input selectable font-mono text-[10.5px]"
                value={authUrl}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                type="button"
                className="btn btn-icon shrink-0"
                onClick={() => void copyLink()}
                title="复制链接"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
              <button
                type="button"
                className="btn btn-icon shrink-0"
                onClick={() => void window.api.openExternal(authUrl)}
                title="在浏览器打开"
              >
                <ArrowUpRight size={14} />
              </button>
            </div>
            <p className="hint">
              如果浏览器没有自动打开，请点击上方按钮。授权页面地址为 rclone 官方本地回调服务。
            </p>
          </div>
        ) : null}

        <div className="flex items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3.5 py-3">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-400" />
          <p className="text-[10.5px] leading-relaxed text-[var(--text-muted)]">
            登录令牌仅保存在本机配置目录的 <span className="font-mono">rclone.conf</span>{' '}
            中，不会上传到任何第三方服务器。你可以随时在设置中断开账户并删除凭证。
          </p>
        </div>

        {starting ? (
          <div className="flex items-center justify-center gap-2 text-[11px] text-[var(--text-muted)]">
            <Spinner size={12} />
            正在连接授权服务…
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

function StepRow({
  index,
  done,
  active,
  title,
  detail
}: {
  index: number
  done: boolean
  active: boolean
  title: string
  detail: string
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors"
        style={{
          borderColor: done
            ? 'rgba(52,211,153,.35)'
            : active
              ? 'rgba(56,189,248,.4)'
              : 'var(--border)',
          background: done
            ? 'rgba(52,211,153,.12)'
            : active
              ? 'rgba(56,189,248,.12)'
              : 'var(--panel-2)',
          color: done
            ? 'var(--success-text)'
            : active
              ? 'var(--brand-text)'
              : 'var(--text-muted)'
        }}
      >
        {done ? <Check size={12} /> : active ? <Loader2 size={11} className="animate-spin" /> : index}
      </span>
      <div className="min-w-0">
        <div
          className="text-[12px] font-medium"
          style={{ color: done || active ? 'var(--text)' : 'var(--text-soft)' }}
        >
          {title}
        </div>
        <div className="mt-0.5 text-[10.5px] leading-relaxed text-[var(--text-muted)]">{detail}</div>
      </div>
    </div>
  )
}
