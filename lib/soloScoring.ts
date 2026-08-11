export type SoloAttempt = { id:string;player_id:string;difficulty:"easy"|"hard";stroke_score:number;hn1_count:number;entered_at:string }

export function bestAttempt(attempts:SoloAttempt[],playerId:string,difficulty:"easy"|"hard"){
  return attempts.filter(a=>a.player_id===playerId&&a.difficulty===difficulty).sort((a,b)=>a.stroke_score-b.stroke_score||b.hn1_count-a.hn1_count||a.entered_at.localeCompare(b.entered_at)||a.id.localeCompare(b.id))[0]||null
}

export function mostHn1(attempts:SoloAttempt[],playerId:string,difficulty:"easy"|"hard"){
  const values=attempts.filter(a=>a.player_id===playerId&&a.difficulty===difficulty).map(a=>a.hn1_count)
  return values.length?Math.max(...values):null
}

export function strokeRank(attempts:SoloAttempt[],playerIds:string[],playerId:string,difficulty:"easy"|"hard"){
  const selected=bestAttempt(attempts,playerId,difficulty)
  if(!selected)return null
  return 1+playerIds.reduce((better,otherId)=>{
    const other=bestAttempt(attempts,otherId,difficulty)
    return better+(other&&(other.stroke_score<selected.stroke_score||(other.stroke_score===selected.stroke_score&&other.hn1_count>selected.hn1_count))?1:0)
  },0)
}

export function hn1Rank(attempts:SoloAttempt[],playerIds:string[],playerId:string,difficulty:"easy"|"hard"){
  const selected=mostHn1(attempts,playerId,difficulty)
  if(selected===null)return null
  return 1+playerIds.filter(otherId=>(mostHn1(attempts,otherId,difficulty)??-1)>selected).length
}

export function competitionRanks<T>(rows:T[],score:(row:T)=>readonly(number|null)[],directions:readonly("asc"|"desc")[]){
  const sorted=[...rows].sort((a,b)=>{const av=score(a),bv=score(b);for(let i=0;i<av.length;i+=1){if(av[i]===bv[i])continue;if(av[i]===null)return 1;if(bv[i]===null)return -1;return directions[i]==="asc"?av[i]!-bv[i]!:bv[i]!-av[i]!}return 0})
  return sorted.map((row,index)=>{const current=score(row);const previous=index?score(sorted[index-1]):null;const tied=previous?.every((value,i)=>value===current[i]);return {row,rank:tied?null:index+1}}).map((item,index,all)=>({...item,rank:item.rank??all[index-1].rank}))
}
