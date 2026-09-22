import { useState } from 'react';
import { useStore } from '../store';
import { ROOMS, SCENES, type Room, type SceneName } from '../types';
import { Empty, SpendCard } from '../components/ui';

export function HomePage() {
  const store = useStore();
  const [room, setRoom] = useState<'全部' | Room>('全部');
  const visible = store.devices.filter((device) => room === '全部' || device.room === room);
  const online = store.devices.filter((device) => !device.offline).length;
  const openAlerts = store.alerts.filter((alert) => !alert.handled);
  const abnormal = openAlerts.some((alert) => alert.level === '高') || store.devices.some((device) => device.offline);

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="display" style={{ fontSize: 32 }}>家居</h1>
          <p className="muted">{online} 台在线 · {store.devices.length - online} 台离线{store.activeScene ? ` · 当前场景 ${store.activeScene}` : ''}</p>
        </div>
        <span className="muted"><i className={abnormal ? 'dot warn' : 'dot'} />{abnormal ? '有设备需要看一眼' : '家里状态正常'}</span>
      </header>
      {store.devices.length === 0 ? (
        <div className="stack">
          <div className="card">
            <Empty title="还没有绑定设备" desc="演示数据可以一键绑上，真实设备对接以后再做。" action={<button type="button" className="btn" onClick={store.bindSampleDevices}>绑定演示设备</button>} />
          </div>
          <SpendCard tag="住" label="本月住家支出" />
        </div>
      ) : (
        <>
          <section className="card" style={{ marginBottom: 14 }}>
            <h2>场景</h2>
            <div className="scene-row" style={{ marginTop: 10 }}>
              {SCENES.map((scene) => (
                <button type="button" key={scene} data-testid={`scene-${scene}`} className={store.activeScene === scene ? 'pill active' : 'pill'} onClick={() => store.applyScene(scene as SceneName)}>{scene}</button>
              ))}
            </div>
          </section>
          <div className="pills">
            <button type="button" className={room === '全部' ? 'pill active' : 'pill'} onClick={() => setRoom('全部')}>全部</button>
            {ROOMS.map((item) => (
              <button type="button" key={item} className={room === item ? 'pill active' : 'pill'} onClick={() => setRoom(item)}>{item}</button>
            ))}
          </div>
          {visible.length === 0 ? (
            <div className="card"><Empty title="这个房间没有设备" desc="换一个房间，或者绑定演示设备。" /></div>
          ) : (
            <div className="device-grid" style={{ marginBottom: 14 }}>
              {visible.map((device) => (
                <article className={`card device${device.on ? '' : ' off'}${device.offline ? ' offline' : ''}`} key={device.id}>
                  <header>
                    <div>
                      <h3>{device.name}</h3>
                      <p className="muted">{device.room}</p>
                    </div>
                    <button type="button" className={device.on ? 'switch on' : 'switch'} disabled={device.offline} aria-label={`${device.on ? '关闭' : '打开'}${device.name}`} onClick={() => store.toggleDevice(device.id)}>
                      <i />
                    </button>
                  </header>
                  <p className={device.offline ? 'status bad' : 'status'}>{device.offline ? '离线 · 保留最后状态' : device.on ? '开启' : '关闭'}</p>
                  {device.paramLabel ? <p>{device.paramLabel} {device.paramValue}</p> : <p className="muted">没有额外参数</p>}
                </article>
              ))}
            </div>
          )}
          <div className="layout-2">
            <article className="card">
              <h2>异常与提醒</h2>
              {openAlerts.length === 0 ? <p className="muted" style={{ marginTop: 8 }}>现在没有待处理的提醒。</p> : openAlerts.map((alert) => (
                <div className="alert" key={alert.id}>
                  <div>
                    <span className={`level ${alert.level}`}>{alert.level}</span>
                    <strong>{alert.title}</strong>
                    <p className="muted">{alert.detail}</p>
                  </div>
                  <button type="button" className="btn-ghost small" onClick={() => store.handleAlert(alert.id)}>知道了</button>
                </div>
              ))}
            </article>
            <SpendCard tag="住" label="本月住家支出" />
          </div>
        </>
      )}
    </>
  );
}
