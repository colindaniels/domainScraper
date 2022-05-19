const PORT = process.env.PORT || 8000

const express = require('express')
const cheerio = require('cheerio')
const axios = require('axios')
const puppeteer = require('puppeteer')

var fileSystem = require('fs')
var fastcsv = require('fast-csv')

// init app
const app = express()

process.on('uncaughtException', function (err) {
    console.error(err);
    console.log("Node NOT Exiting...");
});

app.use('/public', express.static(__dirname + '/public'))


app.get('/afternic', (req, res) => {
    let number_of_results = req.query.results / 20;
    var afternic_list = []
    var i = 1
    async function axiosLoop() {
        var instance = await axios.get(`https://www.afternic.com/ajax/home?AJAX=1&service=newListing&page=${i}`).then((result) => {
            return result.data.response
        })
        i++
        for (let e of instance) {
            afternic_list.push(e)
        }
        if (i <= number_of_results) {
            return axiosLoop()
        }
        else {
            let filtered_list = []
            afternic_list.forEach((e) => {
                filtered_list.push({
                    domain_name: e.name,
                    domain_price: `$${e.buy_now}`,
                    site: 'afternic'
                })
            })
            res.send(filtered_list)
        }
    }
    axiosLoop()
})




app.get('/flippa', (req, res) => {
    let pages = req.query.results / 100
    let i = 1
    let all_domains = []
    async function getPrices() {
        var browser = await puppeteer.launch({
            headless: true,
            
            // Required to run on Heroku
            'args': [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        })
        var page = await browser.newPage()
        await page.goto(`https://flippa.com/domains?sort_alias=most_recent&search_template=most_relevant&filter%5Bsale_method%5D=auction,classified&filter%5Bstatus%5D=open&filter%5Bproperty_type%5D=domain&filter%5Brevenue_generating%5D=T,F&page%5Bsize%5D=100&page%5Bnumber%5D=${i}`)
        await page.waitForSelector('[id^="listing"]')
        let bodyHTML = await page.evaluate(() => document.body.outerHTML);
        let $ = cheerio.load(bodyHTML)
        let all_row = $('[id^="listing"]')
        for (let e of all_row) {
            let domain_name = $(e).find('.GTM-search-result-card .ng-binding').text()
            let price = $(e).find('.text-right .lead').text().replace('USD ', '')
            all_domains.push({
                domain_name: domain_name,
                domain_price: price,
                site: 'flippa'
            })
        }
        if (i < pages) {
            i++
            return getPrices()
        }
        else {
            return all_domains
        }
    }
    getPrices().then((domains) => {
        res.send(domains)
    })
})





app.get('/get-all', async (req, res) => {
    let qry = req.query.results
    let afternic_domains = await axios.get(`${process.env.SERVER_URL}/afternic?results=${qry}`).then((result) => {
        return result.data
    })
    let flippa_domains = await axios.get(`${process.env.SERVER_URL}/flippa?results=${qry}`).then((result) => {
        return result.data
    })
    console.log(afternic_domains.length)
    console.log(flippa_domains.length)
    let all = flippa_domains.concat(afternic_domains)
    res.send(all)
})


app.get('/export-all', async (req, res) => {
    let qry = req.query.results
    await axios.get(`${process.env.SERVER_URL}/get-all?results=${qry}`).then((results) => {
        var ws = fileSystem.createWriteStream('./public/domains.csv');
        fastcsv
            .write(results.data, { headers: true })
            .on('finish', (() => {
                res.send('<a href="./public/domains.csv" download="domains.csv" id="download"></a><script>document.querySelector("#download").click()</script>')
            })).pipe(ws);
    })

})






// init serevr
app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`)
}).on('error', (err) => { console.log(err) })