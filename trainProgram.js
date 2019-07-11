const trainData = require('./trainData');

const STATION_NUM = trainData.stations.length;
const {LOADINGTIME, UNLOADINGTIME, stations} = trainData;
const RUNTIME_MAX = 600;
const POLL_INTERVAL = 1000;// in ms
const MQ = {messages: [], trackInUse: {}};

const trainStatus = {
  LOADING: 'LOADING',
  UNLOADING: 'UNLOADING',
  ONTRACK: 'ONTRACK',
  WAITING: 'WAITING'
};
const MTYPE = {
  REQ: 'requestTrack',
  GRA: 'grantTrack'
};


const calcDist = (begin, speed) => {
  const now = new Date();
  const intervalSec = (now - begin) / 1000;
  return (speed / 3600) * intervalSec * 1000;
};

const grantedForTrack = (mq, track) => {
  return Boolean(
    mq.messages.find(m => m.type === MTYPE.GRA && m.track === track)
  );
};

const isGranted = (mq, train, track) => {
  return Boolean(
    mq.messages.find(m => m.type === MTYPE.GRA
      && m.track === track && m.train === train)
  );
};

const controllerHandle = (mq) => {
  let req;
  for (let i = 0; i < STATION_NUM; i++) {
    if (!mq.trackInUse[i]) {
      req = mq.messages.find(m => m.type === MTYPE.REQ && m.track === i);
      if (req && !grantedForTrack(mq, i)) {
        const {train, track} = req;
        console.log(`Grant permission for train ${train} track ${track}`);
        mq.messages.push({type: MTYPE.GRA, track, train});
      }
    }
  }
};

const controllerProcess = () => {
  const startTime = new Date();
  const endTime = new Date(startTime);
  endTime.setSeconds(startTime.getSeconds() + RUNTIME_MAX);
  const interval = setInterval(() => {
    const now = new Date();
    if (now > endTime) {
      return clearInterval(interval);
    }
    controllerHandle(MQ);
  }, POLL_INTERVAL)
};

const trainProcess = (data, mq) => {
  const {speed, number, beginStation} = data;
  const startTime = new Date();
  const endTime = new Date(startTime);
  endTime.setSeconds(startTime.getSeconds() + RUNTIME_MAX);
  let curStation = beginStation;
  let status = trainStatus.LOADING;
  let beginLoadTime = new Date();
  let endLoadTime = new Date(beginLoadTime);
  endLoadTime.setSeconds(beginLoadTime.getSeconds() + LOADINGTIME);
  let beginMoveTime, trackDist, beginUnloadTime, endUnloadTime, beginWaitTime;
  const interval = setInterval(() => {
    const now = new Date();
    if (now > endTime) {
      return clearInterval(interval);
    }
    if (status === trainStatus.LOADING) {
      if (now < endLoadTime) {
        return console.log(`train ${number} loading at station ${curStation}`);
      }
      status = trainStatus.WAITING;
      beginWaitTime = new Date();
      mq.messages.push({type: MTYPE.REQ, track: curStation, train: number});
      return console.log(`train ${number} start waiting at station ${curStation}`);
    }
    if (status === trainStatus.WAITING) {
      if (isGranted(mq, number, curStation)) {
        status = trainStatus.ONTRACK;
        mq.trackInUse[curStation] = true;
        mq.messages = mq.messages.filter(({track, train}) => {
          return !(track === curStation && train === number);
        });
        beginMoveTime = new Date();
        trackDist = stations.find(s => s.number === curStation).distance;
        return console.log(`train ${number} start moving on track after station ${curStation}`);
      }
      const waitSec = (now - beginWaitTime) / 1000;
      return console.log(`train ${number} waiting ${waitSec} seconds at station ${curStation}`);
    }
    if (status === trainStatus.ONTRACK) {
      const travelM = calcDist(beginMoveTime, speed);
      if (travelM < trackDist) {
        return console.log(`train ${number} travels ${travelM}m after station ${curStation}`);
      }
      const arriveStation = (curStation + 1) % STATION_NUM;
      console.log(`train ${number} arrived at ${arriveStation}`);
      status = trainStatus.UNLOADING;
      mq.trackInUse[curStation] = false;
      beginUnloadTime = new Date();
      endUnloadTime = new Date(beginUnloadTime);
      endUnloadTime.setSeconds(beginUnloadTime.getSeconds() + UNLOADINGTIME);
      curStation = arriveStation;
      return console.log(`train ${number} start unload at station ${arriveStation}`);
    }
    if (status === trainStatus.UNLOADING) {
      if (now < endUnloadTime) {
        return console.log(`train ${number} unloading at ${curStation}`);
      }
      status = trainStatus.LOADING;
      beginLoadTime = new Date();
      endLoadTime = new Date(beginLoadTime);
      endLoadTime.setSeconds(beginLoadTime.getSeconds() + LOADINGTIME);
      return console.log(`train ${number} start load at ${curStation}`);
    }
  }, POLL_INTERVAL)
};
// Run the program
controllerProcess();
trainData.trains.forEach(d => trainProcess(d, MQ));
