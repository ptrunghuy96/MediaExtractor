import StreamingService from './base.js';
import {gen_m3u8_smamuhh1metro} from '../utils/hls.js';
import path from 'path';
import MediaSource from '../utils/mediasource.js';
import request from 'request-promise';

const HYDRAX_VIP_API = "https://multi.hydrax.net/vip";
const HYDRAX_GUEST_API = "https://multi.hydrax.net/guest";
const HYDRAX_SUPPORTED_MEDIA =  new Set(['fullhd', 'hd', 'mhd', 'sd', 'origin']);

async function getHydraxResp(api, hydrax_slug, hydrax_key=null, origin, proxy=null)
{
    let headers = {
        'Referer': origin,
        'Origin': origin,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36'
    };

    let data = {}
    if(hydrax_key) {
        data = {
            'key': hydrax_key,
            'type': 'slug',
            'value': hydrax_slug
        };
    } else {
        data = {
            'slug': hydrax_slug,
        };
    }

    let body = (await request({
        "uri": api,
        "headers": headers, 
        "form": data,
        "method": "POST",
        "proxy": proxy // possible IP ban
    }));
    // POST to hyrax API
    let apiResponse = JSON.parse(body);
 
    return apiResponse;
}

async function getVipHydraxResp(hydrax_slug, hydrax_key, origin, proxy=null) {
    return await getHydraxResp(HYDRAX_VIP_API, hydrax_slug, hydrax_key, origin, proxy);
}

async function getGuestHydraxResp(hydrax_slug, hydrax_key, origin, proxy=null) {
    return await getHydraxResp(HYDRAX_GUEST_API, hydrax_slug, hydrax_key, origin, proxy);
}

class Hydrax extends StreamingService {
    constructor(cacheManager=null) {
        super(cacheManager, "Hydrax", ["_gen_m3u8_smamuhh1metro", "_getHydraxApiResp"]);
    }

    async _getProxy() {
        if(this.proxyManager)
            return await this.proxyManager.getProxy({});
        
        return null;
    }


    async _gen_m3u8_smamuhh1metro(aux) {
        let m3u8Link = null;
        try {
            m3u8Link = await gen_m3u8_smamuhh1metro(aux["streamServer"], aux["data"]);
        } catch (e) {
            console.log(e)
        }

        return m3u8Link;
    }

    async _getHydraxApiResp(aux) {
        let hydraxApiResp = null;
        try {
            if("key" in aux && aux["key"])  // use vip API
                hydraxApiResp = await getVipHydraxResp(aux["slug"], aux["key"], aux["origin"], await this._getProxy());
            else  //use guest API
                hydraxApiResp = await getGuestHydraxResp(aux["slug"], null, aux["origin"], await this._getProxy());
        } catch(e) {
            console.log("Error calling HydraxAPI. Aux: "+JSON.stringify(aux));
            return null;
        }

        if(!hydraxApiResp || ("status" in hydraxApiResp && hydraxApiResp.status == false)) {
            console.log(hydraxApiResp);
            return null;
        }
       
        return hydraxApiResp;
    }

    async getMediaSource(aux) {
        let hydraxApiResp = await this._getHydraxApiResp({
            ...aux,
            cacheKey : JSON.stringify(aux)+"_getHydraxApiResp"
        });

        if(!hydraxApiResp)  
            return null;

        let medias = [];
        //process api response to genenerate m3u8 files
        if("ping" in hydraxApiResp && hydraxApiResp["ping"].includes("smamuhh1metro")) { //schema for smauhh1metro
            console.log(hydraxApiResp);
            const keys = Object.keys(hydraxApiResp);
            for(const mediaType of keys){
                // cache layer for m3u8 file
                if(HYDRAX_SUPPORTED_MEDIA.has(mediaType))  {
                    let m3u8Link = await this._gen_m3u8_smamuhh1metro({
                            streamServer: hydraxApiResp["servers"]["stream"], 
                            data: hydraxApiResp[mediaType],
                            cacheKey : JSON.stringify(aux)+`${mediaType}_${hydraxApiResp["servers"]["stream"]}`
                        });
                    if(!m3u8Link)
                        continue;
                    medias.push(new MediaSource(m3u8Link, "hls", mediaType));
                }
            }
        } 
        return medias.length ? medias : null;
    }
}

module.exports = new Hydrax();