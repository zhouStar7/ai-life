export type ItineraryDraft = {
  title: string;
  status: '即将开始';
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

  const flight = source.match(/(\d{1,2})月(\d{1,2})日\s*([A-Z]{2}\d{3,4})\s*([^\s，,。]{2,20}?)\s*(\d{1,2}:\d{2})\s*(?:起飞|出发)[，,\s]*(\d{1,2}:\d{2})\s*(?:抵达|到达)\s*([^\s，,。]{2,20})/);
  const flightMail = source.match(/航班\s*([A-Z]{2}\d{3,4})[\s\S]*?出发[:：]\s*(\d{4})-(\d{2})-(\d{2})\s*(\d{1,2}:\d{2})\s*(\S+)[\s\S]*?到达[:：]\s*\d{4}-(\d{2})-(\d{2})\s*(\d{1,2}:\d{2})\s*(\S+)/);
  const train = source.match(/(\d{1,2})月(\d{1,2})日\s*([GDC]\d{2,5})\s*([^\s，,。]{2,20}?)\s*(\d{1,2}:\d{2})\s*(?:开|出发)[，,\s]*(\d{1,2}:\d{2})\s*(?:到|抵达)\s*([^\s，,。]{2,20})/);

  if (flight) {
    const [, month, day, code, from, depart, arrive, to] = flight;
    transport = '飞机';
    destination = city(to);
    days.push(labelDay(month, day));
    tickets.push({ label: code, status: '已出票' });
    timeline.push({ time: clock(month, day, depart), title: '出发', detail: from });
    timeline.push({ time: clock(month, day, arrive), title: '抵达', detail: to });
  } else if (flightMail) {
    const [, code, , month, day, depart, from, arriveMonth, arriveDay, arrive, to] = flightMail;
    transport = '飞机';
    destination = city(to);
    days.push(labelDay(month, day), labelDay(arriveMonth, arriveDay));
    tickets.push({ label: code, status: '已出票' });
    timeline.push({ time: clock(month, day, depart), title: '出发', detail: from });
    timeline.push({ time: clock(arriveMonth, arriveDay, arrive), title: '抵达', detail: to });
  } else if (train) {
    const [, month, day, code, from, depart, arrive, to] = train;
    transport = '高铁';
    destination = city(to);
    days.push(labelDay(month, day));
    tickets.push({ label: code, status: '已出票' });
    timeline.push({ time: clock(month, day, depart), title: '出发', detail: from });
    timeline.push({ time: clock(month, day, arrive), title: '抵达', detail: to });
  }

  const hotel = source.match(/([\u4e00-\u9fa5A-Za-z0-9]{2,24}酒店)\s*(\d{1,2})月(\d{1,2})日入住[，,\s]*(\d{1,2})月(\d{1,2})日(?:离店|退房)/);
  const hotelMail = source.match(/酒店[:：]\s*([^\n]{2,30})[\s\S]*?入住[:：]\s*(\d{1,2})月(\d{1,2})日[\s\S]*?离店[:：]\s*(\d{1,2})月(\d{1,2})日/);
  if (hotel) {
    const [, name, inMonth, inDay, outMonth, outDay] = hotel;
    tickets.push({ label: name, status: /已确认|确认/.test(source) ? '已确认' : '待确认' });
    timeline.push({ time: labelDay(inMonth, inDay), title: '入住', detail: name });
    timeline.push({ time: labelDay(outMonth, outDay), title: '离店', detail: name });
    days.push(labelDay(inMonth, inDay), labelDay(outMonth, outDay));
    if (!destination) destination = city(name);
  } else if (hotelMail) {
    const [, name, inMonth, inDay, outMonth, outDay] = hotelMail;
    const hotelName = name.trim();
    tickets.push({ label: hotelName, status: '已确认' });
    timeline.push({ time: labelDay(inMonth, inDay), title: '入住', detail: hotelName });
    timeline.push({ time: labelDay(outMonth, outDay), title: '离店', detail: hotelName });
    days.push(labelDay(inMonth, inDay), labelDay(outMonth, outDay));
    if (!destination) destination = city(hotelName);
  }

  if (timeline.length === 0) return null;
  const packing = ['身份证', '充电器', '换洗衣物'];
  if (transport === '飞机') packing.push('登机证件');
  if (/雨/.test(source)) packing.push('雨伞');
  else if (/降温|寒冷|冷/.test(source)) packing.push('保暖内胆');
  const uniqueDays = [...new Set(days)];
  return {
    title: `${destination || '出行'}行程`,
    status: '即将开始',
    transport: transport || '其他',
    dateLabel: uniqueDays.length > 1 ? `${uniqueDays[0]} – ${uniqueDays[uniqueDays.length - 1]}` : (uniqueDays[0] || '日期待定'),
    tickets,
    timeline,
    packing,
  };
}

function labelDay(month: string, day: string) {
  return `${Number(month)}月${Number(day)}日`;
}

function clock(month: string, day: string, time: string) {
  return `${Number(month).toString().padStart(2, '0')}-${Number(day).toString().padStart(2, '0')} ${time}`;
}

function city(place: string) {
  const known = ['北京', '上海', '杭州', '广州', '深圳', '成都', '哈尔滨'];
  const found = known.find((item) => place.includes(item));
  if (found) return found;
  return place.replace(/酒店|T\d|机场|站/g, '').slice(0, 4) || '出行';
}
