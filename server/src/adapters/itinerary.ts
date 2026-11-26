import { inferTripDates, type TripDates, type TripStatus } from '../../../shared/trips.js';
import { extractJson } from '../json.js';
import { localDate } from '../localDate.js';

export type ItineraryDraft = TripDates & {
  title: string;
  status: TripStatus;
  transport: string;
  dateLabel: string;
  tickets: { label: string; status: string }[];
  timeline: { time: string; title: string; detail: string }[];
  packing: string[];
};

export function parseItinerary(text: string): ItineraryDraft | null {
  const source = text.replace(/\r/g, '').trim();
  if (!source) return null;
  const timeline: ItineraryDraft['timeline'] = [];
  const tickets: ItineraryDraft['tickets'] = [];
  const days: string[] = [];
  let transport = '';
  let destination = '';

  const flight = source.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*([A-Z]{2}\d{3,4})\s*([^\s，,。]{2,20}?)\s*(\d{1,2}:\d{2})\s*(?:起飞|出发)[，,\s]*(\d{1,2}:\d{2})\s*(?:抵达|到达)\s*([^\s，,。]{2,20})/);
  const flightMail = source.match(/航班\s*([A-Z]{2}\d{3,4})[\s\S]*?出发[:：]\s*(\d{4})-(\d{2})-(\d{2})\s*(\d{1,2}:\d{2})\s*(\S+)[\s\S]*?到达[:：]\s*(\d{4})-(\d{2})-(\d{2})\s*(\d{1,2}:\d{2})\s*(\S+)/);
  const train = source.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*([GDC]\d{2,5})\s*([^\s，,。]{2,20}?)\s*(\d{1,2}:\d{2})\s*(?:开|出发)[，,\s]*(\d{1,2}:\d{2})\s*(?:到|抵达)\s*([^\s，,。]{2,20})/);

  const railNotice = source.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*(\d{1,2}:\d{2})\s*([\p{Script=Han}]{2,16}?)站?开\s*([GDCZTK]\d{1,5})次[^。\n]{0,40}?[（(，,]\s*([\p{Script=Han}]{2,16}?)(?:至|到|[—-])([\p{Script=Han}]{2,16}?)(?:[）)，,。\s]|$)/u);
  const mailCode = source.match(/航班(?:号|编号)?\s*[:：]?\s*([A-Z0-9]{2}\d{3,4})/i);
  const mailStop = (field: string) => source.match(new RegExp(`(?:${field})[:：]\\s*(\\d{4}[-/]\\d{1,2}[-/]\\d{1,2})[ \\t]+(\\d{1,2}:\\d{2})[ \\t]+([^\\n，,。]+)`));
  const departure = mailStop('起飞时间|起飞|出发时间|出发');
  const arrival = mailStop('抵达时间|抵达|到达时间|到达');
  const railTicket = source.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*(\d{1,2}:\d{2})\s*([\p{Script=Han}]{2,16}?)(?:至|到)([\p{Script=Han}]{2,16}?)\s*([GDCZTK]\d{1,5})次/u);
  if (railTicket) {
    const [, year, month, day, depart, from, to, code] = railTicket;
    const date = `${year ? `${year}年` : ''}${labelDay(month, day)}`;
    transport = /^[GDC]/.test(code) ? '高铁' : '火车';
    destination = city(to);
    days.push(date);
    tickets.push({ label: code, status: '已出票' });
    timeline.push({ time: `${date} ${depart}`, title: '出发', detail: from }, { time: '待确认', title: '抵达', detail: to });
  } else if (mailCode && departure && arrival) {
    transport = '飞机';
    destination = city(arrival[3].trim());
    tickets.push({ label: mailCode[1].toUpperCase(), status: '已出票' });
    for (const [title, stop] of [['出发', departure], ['抵达', arrival]] as const) {
      const date = stop[1].replaceAll('/', '-');
      days.push(date);
      timeline.push({ time: `${date} ${stop[2]}`, title, detail: stop[3].trim() });
    }
  } else if (railNotice) {
    const [, year, month, day, depart, from, code, , to] = railNotice;
    transport = /^[GDC]/.test(code) ? '高铁' : '火车';
    destination = city(to);
    days.push(`${year ? `${year}年` : ''}${labelDay(month, day)}`);
    tickets.push({ label: code, status: '已出票' });
    timeline.push({ time: clock(month, day, depart, year), title: '出发', detail: from });
    timeline.push({ time: '待确认', title: '抵达', detail: to });
  } else if (flight) {
    const [, year, month, day, code, from, depart, arrive, to] = flight;
    transport = '飞机';
    destination = city(to);
    days.push(labelDay(month, day, year));
    tickets.push({ label: code, status: '已出票' });
    timeline.push({ time: clock(month, day, depart, year), title: '出发', detail: from });
    timeline.push({ time: clock(month, day, arrive, year), title: '抵达', detail: to });
  } else if (flightMail) {
    const [, code, departYear, month, day, depart, from, arriveYear, arriveMonth, arriveDay, arrive, to] = flightMail;
    transport = '飞机';
    destination = city(to);
    days.push(`${departYear}-${month}-${day}`, `${arriveYear}-${arriveMonth}-${arriveDay}`);
    tickets.push({ label: code, status: '已出票' });
    timeline.push({ time: `${days[0]} ${depart}`, title: '出发', detail: from });
    timeline.push({ time: `${days[1]} ${arrive}`, title: '抵达', detail: to });
  } else if (train) {
    const [, year, month, day, code, from, depart, arrive, to] = train;
    transport = '高铁';
    destination = city(to);
    days.push(labelDay(month, day, year));
    tickets.push({ label: code, status: '已出票' });
    timeline.push({ time: clock(month, day, depart, year), title: '出发', detail: from });
    timeline.push({ time: clock(month, day, arrive, year), title: '抵达', detail: to });
  }

  const hotel = source.match(/([\u4e00-\u9fa5A-Za-z0-9]{2,24}酒店)\s*(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日入住[，,\s]*(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日(?:离店|退房)/);
  const hotelMail = source.match(/酒店[:：]\s*([^\n]{2,30})[\s\S]*?入住[:：]\s*(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日[\s\S]*?离店[:：]\s*(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/);
  const stay = hotel ?? hotelMail;
  if (stay) {
    const [, name, inYear, inMonth, inDay, outYear, outMonth, outDay] = stay;
    const hotelName = name.trim();
    const checkIn = labelDay(inMonth, inDay, inYear);
    const checkOut = labelDay(outMonth, outDay, outYear);
    tickets.push({ label: hotelName, status: hotel ? (/确认/.test(source) ? '已确认' : '待确认') : '已确认' });
    timeline.push({ time: checkIn, title: '入住', detail: hotelName });
    timeline.push({ time: checkOut, title: '离店', detail: hotelName });
    days.push(checkIn, checkOut);
    if (!destination) destination = city(hotelName);
  }

  if (timeline.length === 0) loosen(source, timeline, tickets, days, (value) => { transport = value; }, (value) => { destination = value; });
  if (!timeline.some((node) => node.title === '入住')) loosenHotel(source, timeline, tickets, days, (value) => { if (!destination) destination = value; });

  if (timeline.length === 0) return null;
  const packing = ['身份证', '充电器', '换洗衣物'];
  if (transport === '飞机') packing.push('登机证件');
  if (/雨/.test(source)) packing.push('雨伞');
  else if (/降温|寒冷|冷/.test(source)) packing.push('保暖内胆');
  const uniqueDays = [...new Set(days)];
  const dateLabel = uniqueDays.length > 1 ? `${uniqueDays[0]} – ${uniqueDays.at(-1)}` : (uniqueDays[0] || '日期待定');
  return {
    title: `${destination || '出行'}行程`,
    status: '即将开始',
    transport: transport || '其他',
    dateLabel,
    ...inferTripDates(dateLabel, timeline.map(node => node.time), localDate()),
    tickets,
    timeline,
    packing,
  };
}

function labelDay(month: string, day: string, year?: string) {
  return `${year ? `${year}年` : ''}${Number(month)}月${Number(day)}日`;
}

function clock(month: string, day: string, time: string, year?: string) {
  return `${year ? `${year}-` : ''}${month.padStart(2, '0')}-${day.padStart(2, '0')} ${time}`;
}

function city(place: string) {
  const known = ['北京', '上海', '杭州', '广州', '深圳', '成都', '哈尔滨', '长春', '沈阳', '三亚', '海口'];
  const found = known.find((item) => place.includes(item));
  if (found) return found;
  return place.replace(/酒店|T\d|机场|站/g, '').slice(0, 4) || '出行';
}

function loosen(
  source: string,
  timeline: ItineraryDraft['timeline'],
  tickets: ItineraryDraft['tickets'],
  days: string[],
  setTransport: (value: string) => void,
  setDestination: (value: string) => void,
) {
  const flight = source.match(/([A-Z]{2}\d{3,4})[\s\S]{0,40}?(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日[\s\S]{0,30}?(\d{1,2}:\d{2})\s*(?:从)?\s*([^\s，,。]{2,16}?)\s*(?:起飞|出发)[\s\S]{0,20}?(\d{1,2}:\d{2})\s*(?:抵达|到达)\s*([^\s，,。]{2,20})/);
  const train = source.match(/(?:车次\s*)?([GDC]\d{2,5})[\s\S]{0,30}?(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日[\s\S]{0,24}?(\d{1,2}:\d{2})\s*(?:从)?\s*([^\s，,。]{2,16}?)\s*(?:开|出发)[\s\S]{0,16}?(\d{1,2}:\d{2})\s*(?:到|抵达)\s*([^\s，,。]{2,20})/);
  const dated = source.match(/(\d{4})[-/.](\d{2})[-/.](\d{2})\s+(\d{1,2}:\d{2})\s+(\S+)\s*(?:起飞|出发|开)[\s\S]{0,40}?(\d{1,2}:\d{2})\s*(?:抵达|到达|到)\s*(\S+)/);
  const ticketCode = source.match(/[A-Z]{2}\d{3,4}|[GDC]\d{2,5}/)?.[0] ?? '行程';
  const ticket = flight ?? train ?? (dated && [dated[0], ticketCode, ...dated.slice(1)]);
  if (!ticket) return;
  const [, code, year, month, day, depart, from, arrive, to] = ticket;
  setTransport(/^[GDC]\d/.test(code) ? '高铁' : '飞机');
  setDestination(city(to));
  days.push(labelDay(month, day, year));
  tickets.push({ label: code, status: '已出票' });
  timeline.push({ time: clock(month, day, depart, year), title: '出发', detail: from });
  timeline.push({ time: clock(month, day, arrive, year), title: '抵达', detail: to });
}

function loosenHotel(
  source: string,
  timeline: ItineraryDraft['timeline'],
  tickets: ItineraryDraft['tickets'],
  days: string[],
  setDestination: (value: string) => void,
) {
  const hotel = source.match(/([\u4e00-\u9fa5A-Za-z0-9]{2,24}酒店)[\s\S]{0,24}?(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*(?:入住|到店)[\s\S]{0,24}?(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*(?:离店|退房|离开)/);
  if (!hotel) return;
  const [, name, inYear, inMonth, inDay, outYear, outMonth, outDay] = hotel;
  const checkIn = labelDay(inMonth, inDay, inYear);
  const checkOut = labelDay(outMonth, outDay, outYear);
  tickets.push({ label: name, status: /确认|预订/.test(source) ? '已确认' : '待确认' });
  timeline.push({ time: checkIn, title: '入住', detail: name });
  timeline.push({ time: checkOut, title: '离店', detail: name });
  days.push(checkIn, checkOut);
  setDestination(city(name));
}

const MODEL_PROMPT = '从短信或邮件里抽出行程，只返回 JSON：{"title":"","transport":"飞机","dateLabel":"","destination":"","tickets":[{"label":"","status":"已出票"}],"timeline":[{"time":"","title":"出发","detail":""}],"packing":["身份证"]}。transport 只能是飞机、高铁或其他。timeline.title 只能是出发、抵达、入住、离店。读不出时间线就返回 {"timeline":[]}。';

export function draftFromModel(content: string): ItineraryDraft | null {
  const parsed = extractJson(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const row = parsed as Record<string, unknown>;
  const timeline = Array.isArray(row.timeline)
    ? row.timeline.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const node = item as Record<string, unknown>;
      const title = typeof node.title === 'string' ? node.title.trim() : '';
      const detail = typeof node.detail === 'string' ? node.detail.trim() : '';
      if (!['出发', '抵达', '入住', '离店'].includes(title) || !detail) return [];
      return [{ time: typeof node.time === 'string' && node.time.trim() ? node.time.trim() : '待定', title, detail }];
    })
    : [];
  if (timeline.length === 0) return null;
  const transport = row.transport === '飞机' || row.transport === '高铁' ? row.transport : '其他';
  const tickets = Array.isArray(row.tickets)
    ? row.tickets.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const ticket = item as Record<string, unknown>;
      const label = typeof ticket.label === 'string' ? ticket.label.trim() : '';
      if (!label) return [];
      return [{ label, status: typeof ticket.status === 'string' && ticket.status.trim() ? ticket.status.trim() : '待确认' }];
    })
    : [];
  const packing = Array.isArray(row.packing)
    ? row.packing.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
  const destination = typeof row.destination === 'string' ? row.destination.trim() : '';
  const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim() : `${destination || '出行'}行程`;
  const dateLabel = typeof row.dateLabel === 'string' && row.dateLabel.trim() ? row.dateLabel.trim() : '日期待定';
  return {
    title,
    status: '即将开始',
    transport,
    dateLabel,
    ...inferTripDates(dateLabel, timeline.map(node => node.time), localDate()),
    tickets,
    timeline,
    packing: packing.length > 0 ? packing : ['身份证', '充电器', '换洗衣物'],
  };
}

export const ITINERARY_MODEL_PROMPT = MODEL_PROMPT;
