Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Drawing

$W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
$R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
$RelNs = 'http://schemas.openxmlformats.org/package/2006/relationships'
$CtNs = 'http://schemas.openxmlformats.org/package/2006/content-types'
$ImageRel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'

function New-TempDir {
  $base = [IO.Path]::Combine([IO.Path]::GetTempPath(), 'hitch-docx-' + [guid]::NewGuid().ToString('N'))
  [IO.Directory]::CreateDirectory($base) | Out-Null
  return $base
}

function Load-XmlPreserve([string]$path) {
  $doc = New-Object System.Xml.XmlDocument
  $doc.PreserveWhitespace = $true
  $doc.Load($path)
  return $doc
}

function New-Ns([System.Xml.XmlDocument]$doc) {
  $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
  [void]$ns.AddNamespace('w', $W)
  [void]$ns.AddNamespace('r', $R)
  return ,$ns
}

function Get-ParagraphText($paragraph, [System.Xml.XmlNamespaceManager]$ns) {
  $texts = $paragraph.SelectNodes('.//w:t', $ns)
  return (($texts | ForEach-Object { $_.'#text' }) -join '').Trim()
}

function Find-Paragraph([System.Xml.XmlDocument]$doc, [System.Xml.XmlNamespaceManager]$ns, [string]$contains) {
  foreach ($p in $doc.SelectNodes('//w:body/w:p', $ns)) {
    if ((Get-ParagraphText $p $ns).Contains($contains)) {
      return $p
    }
  }
  throw "Paragraph containing '$contains' was not found."
}

function Try-Find-Paragraph([System.Xml.XmlDocument]$doc, [System.Xml.XmlNamespaceManager]$ns, [string]$contains) {
  foreach ($p in $doc.SelectNodes('//w:body/w:p', $ns)) {
    if ((Get-ParagraphText $p $ns).Contains($contains)) {
      return $p
    }
  }
  return $null
}

function Insert-After($node, $newNode) {
  [void]$node.ParentNode.InsertAfter($newNode, $node)
  return $newNode
}

function Remove-ParagraphsBetween([System.Xml.XmlDocument]$doc, [System.Xml.XmlNamespaceManager]$ns, [string]$startContains, [string]$endContains) {
  $body = $doc.SelectSingleNode('//w:body', $ns)
  $start = Try-Find-Paragraph $doc $ns $startContains
  $end = Try-Find-Paragraph $doc $ns $endContains
  if ($null -eq $start -or $null -eq $end) { return }
  $started = $false
  $remove = @()
  foreach ($node in @($body.ChildNodes)) {
    if ($node -eq $start) {
      $started = $true
      continue
    }
    if ($node -eq $end) {
      break
    }
    if ($started -and $node.LocalName -eq 'p') {
      $remove += $node
    }
  }
  foreach ($node in $remove) {
    [void]$body.RemoveChild($node)
  }
}

function Remove-ParagraphContaining([System.Xml.XmlDocument]$doc, [System.Xml.XmlNamespaceManager]$ns, [string]$contains) {
  $p = Try-Find-Paragraph $doc $ns $contains
  if ($null -eq $p) { return }
  [void]$p.ParentNode.RemoveChild($p)
}

function Remove-ParagraphsAfter([System.Xml.XmlDocument]$doc, [System.Xml.XmlNamespaceManager]$ns, [string]$startContains) {
  $body = $doc.SelectSingleNode('//w:body', $ns)
  $start = Try-Find-Paragraph $doc $ns $startContains
  if ($null -eq $start) { return }
  $started = $false
  $remove = @()
  foreach ($node in @($body.ChildNodes)) {
    if ($node -eq $start) {
      $started = $true
      continue
    }
    if ($started -and $node.LocalName -eq 'p') {
      $remove += $node
    }
  }
  foreach ($node in $remove) {
    [void]$body.RemoveChild($node)
  }
}

function Get-NextRid($relsDoc) {
  $max = 0
  foreach ($rel in $relsDoc.DocumentElement.ChildNodes) {
    $id = $rel.GetAttribute('Id')
    if ($id -match '^rId(\d+)$') {
      $n = [int]$Matches[1]
      if ($n -gt $max) { $max = $n }
    }
  }
  return 'rId' + ($max + 1)
}

function Ensure-PngContentType($ctDoc) {
  foreach ($node in $ctDoc.DocumentElement.ChildNodes) {
    if ($node.LocalName -eq 'Default' -and $node.GetAttribute('Extension') -eq 'png') {
      return
    }
  }
  $default = $ctDoc.CreateElement('Default', $CtNs)
  $default.SetAttribute('Extension', 'png')
  $default.SetAttribute('ContentType', 'image/png')
  [void]$ctDoc.DocumentElement.AppendChild($default)
}

function Add-ImageRelationship($relsDoc, [string]$rid, [string]$target) {
  $rel = $relsDoc.CreateElement('Relationship', $RelNs)
  $rel.SetAttribute('Id', $rid)
  $rel.SetAttribute('Type', $ImageRel)
  $rel.SetAttribute('Target', $target)
  [void]$relsDoc.DocumentElement.AppendChild($rel)
}

function New-CaptionParagraph($doc, [string]$caption) {
  $fragment = $doc.CreateDocumentFragment()
  $fragment.InnerXml = @"
<w:p xmlns:w="$W">
  <w:pPr>
    <w:jc w:val="center"/>
    <w:spacing w:before="80" w:after="180"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:i/>
      <w:color w:val="5B6578"/>
      <w:sz w:val="18"/>
    </w:rPr>
    <w:t>$([System.Security.SecurityElement]::Escape($caption))</w:t>
  </w:r>
</w:p>
"@
  return $fragment.FirstChild
}

function New-ImageParagraph($doc, [string]$rid, [string]$name, [string]$descr, [int64]$cx, [int64]$cy, [int]$docPrId) {
  $safeName = [System.Security.SecurityElement]::Escape($name)
  $safeDescr = [System.Security.SecurityElement]::Escape($descr)
  $fragment = $doc.CreateDocumentFragment()
  $fragment.InnerXml = @"
<w:p xmlns:w="$W" xmlns:r="$R" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:pPr>
    <w:jc w:val="center"/>
    <w:spacing w:before="160" w:after="60"/>
  </w:pPr>
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="$cx" cy="$cy"/>
        <wp:effectExtent l="0" t="0" r="0" b="0"/>
        <wp:docPr id="$docPrId" name="$safeName" descr="$safeDescr"/>
        <wp:cNvGraphicFramePr>
          <a:graphicFrameLocks noChangeAspect="1"/>
        </wp:cNvGraphicFramePr>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:nvPicPr>
                <pic:cNvPr id="0" name="$safeName" descr="$safeDescr"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="$rid"/>
                <a:stretch>
                  <a:fillRect/>
                </a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="$cx" cy="$cy"/>
                </a:xfrm>
                <a:prstGeom prst="rect">
                  <a:avLst/>
                </a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>
"@
  return $fragment.FirstChild
}

function Add-DiagramAfter($ctx, [string]$afterContains, [string]$imagePath, [string]$name, [string]$caption, [double]$widthInches = 6.2) {
  if ($null -ne (Try-Find-Paragraph $ctx.Doc $ctx.Ns $caption)) {
    return
  }
  $anchor = Find-Paragraph $ctx.Doc $ctx.Ns $afterContains
  $image = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $imagePath).Path)
  try {
    $cx = [int64]($widthInches * 914400)
    $cy = [int64]($cx * $image.Height / $image.Width)
  } finally {
    $image.Dispose()
  }

  $mediaDir = Join-Path $ctx.WorkDir 'word\media'
  if (-not (Test-Path -LiteralPath $mediaDir)) {
    [IO.Directory]::CreateDirectory($mediaDir) | Out-Null
  }
  $imageIndex = @(Get-ChildItem -LiteralPath $mediaDir -Filter 'image*.png' -ErrorAction SilentlyContinue).Count + 1
  $targetName = "image$imageIndex.png"
  Copy-Item -LiteralPath $imagePath -Destination (Join-Path $mediaDir $targetName) -Force

  $rid = Get-NextRid $ctx.Rels
  Add-ImageRelationship $ctx.Rels $rid "media/$targetName"

  $ctx.DocPrId += 1
  $imgPara = New-ImageParagraph $ctx.Doc $rid $name $caption $cx $cy $ctx.DocPrId
  $capPara = New-CaptionParagraph $ctx.Doc $caption
  $inserted = Insert-After $anchor $imgPara
  [void]$inserted.ParentNode.InsertAfter($capPara, $inserted)
}

function Remove-UnusedImages($ctx) {
  $used = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($match in [regex]::Matches($ctx.Doc.OuterXml, 'r:embed="([^"]+)"')) {
    [void]$used.Add($match.Groups[1].Value)
  }
  $remove = @()
  foreach ($rel in @($ctx.Rels.DocumentElement.ChildNodes)) {
    if ($rel.LocalName -eq 'Relationship' -and $rel.GetAttribute('Type') -eq $ImageRel) {
      $rid = $rel.GetAttribute('Id')
      if (-not $used.Contains($rid)) {
        $target = $rel.GetAttribute('Target')
        $mediaPath = Join-Path (Join-Path $ctx.WorkDir 'word') $target.Replace('/', '\')
        if (Test-Path -LiteralPath $mediaPath) {
          Remove-Item -LiteralPath $mediaPath -Force
        }
        $remove += $rel
      }
    }
  }
  foreach ($rel in $remove) {
    [void]$ctx.Rels.DocumentElement.RemoveChild($rel)
  }
}

function Patch-Docx([string]$docxPath, [scriptblock]$operations) {
  $source = (Resolve-Path -LiteralPath $docxPath).Path
  $tmp = New-TempDir
  try {
    [System.IO.Compression.ZipFile]::ExtractToDirectory($source, $tmp)
    $documentPath = Join-Path $tmp 'word\document.xml'
    $relsPath = Join-Path $tmp 'word\_rels\document.xml.rels'
    $ctPath = Join-Path $tmp '[Content_Types].xml'
    $doc = Load-XmlPreserve $documentPath
    $rels = Load-XmlPreserve $relsPath
    $ct = Load-XmlPreserve $ctPath
    Ensure-PngContentType $ct
    $ctx = [pscustomobject]@{
      WorkDir = $tmp
      Doc = $doc
      Ns = New-Ns $doc
      Rels = $rels
      ContentTypes = $ct
      DocPrId = ([regex]::Matches($doc.OuterXml, '<wp:docPr[^>]+id="(\d+)"') | ForEach-Object { [int]$_.Groups[1].Value } | Measure-Object -Maximum).Maximum
    }
    if ($null -eq $ctx.DocPrId) { $ctx.DocPrId = 0 }
    & $operations $ctx
    Remove-UnusedImages $ctx
    $doc.Save($documentPath)
    $rels.Save($relsPath)
    $ct.Save($ctPath)
    $out = Join-Path ([IO.Path]::GetDirectoryName($source)) ([IO.Path]::GetFileNameWithoutExtension($source) + '.patched.docx')
    if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Force }
    $zipOut = [System.IO.Compression.ZipFile]::Open($out, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
      foreach ($file in Get-ChildItem -LiteralPath $tmp -Recurse -File) {
        $relative = $file.FullName.Substring($tmp.Length).TrimStart('\', '/').Replace('\', '/')
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipOut, $file.FullName, $relative, [System.IO.Compression.CompressionLevel]::Optimal)
      }
    } finally {
      $zipOut.Dispose()
    }
    Move-Item -LiteralPath $out -Destination $source -Force
  } finally {
    if ($tmp -and $tmp.StartsWith([IO.Path]::GetTempPath())) {
      Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

$diagrams = Resolve-Path -LiteralPath 'docs\ontwerp\diagrams'

Patch-Docx 'docs\ontwerp\functioneel-ontwerp.docx' {
  param($ctx)
  Add-DiagramAfter $ctx '6 Systeemopbouw' (Join-Path $diagrams 'architecture.png') 'Systeemopbouw HitchTracker' 'Figuur 1. Systeemopbouw van HitchTracker.'
  Remove-ParagraphContaining $ctx.Doc $ctx.Ns 'Gebruiker 0..1 ---- 0..* Rit'
  Add-DiagramAfter $ctx '7 1 Conceptuele relaties' (Join-Path $diagrams 'dataModel.png') 'Conceptueel datamodel HitchTracker' 'Figuur 2. Conceptueel datamodel van ritten, routes en prijzen.'
  Add-DiagramAfter $ctx '8 Domeinmodel' (Join-Path $diagrams 'classDiagram.png') 'Domeinmodel HitchTracker' 'Figuur 3. Domeinmodel met belangrijkste verantwoordelijkheden.'
  Add-DiagramAfter $ctx '9 Belangrijkste processen' (Join-Path $diagrams 'activity.png') 'Procesflow HitchTracker' 'Figuur 4. Procesflow van routevoorstel tot eindprijs.'
  Add-DiagramAfter $ctx '10 API en routes' (Join-Path $diagrams 'apiFlow.png') 'API flow HitchTracker' 'Figuur 5. API-flow voor routevoorstel en ritvoortgang.'
}

Patch-Docx 'docs\ontwerp\ontwerp-fase-1.docx' {
  param($ctx)
  Remove-ParagraphContaining $ctx.Doc $ctx.Ns 'Gebruiker  + id, naam, email, rol'
  Add-DiagramAfter $ctx '6 3 Klassendiagram in tekst' (Join-Path $diagrams 'classDiagram.png') 'Klassendiagram HitchTracker' 'Figuur 1. Klassendiagram van de HitchTracker MVP.'
  Add-DiagramAfter $ctx '7 Use cases' (Join-Path $diagrams 'useCases.png') 'Usecasediagram HitchTracker' 'Figuur 2. Usecasediagram met passagier en medewerker.'
  Remove-ParagraphContaining $ctx.Doc $ctx.Ns '+----------------------------------+| HitchTracker'
  Remove-ParagraphContaining $ctx.Doc $ctx.Ns '+----------------------------------+| Amsterdam Centraal'
  Remove-ParagraphContaining $ctx.Doc $ctx.Ns '+----------------------------------+| Naar: Museumplein'
  Remove-ParagraphContaining $ctx.Doc $ctx.Ns '+----------------------------------+| Rit afgerond'
  Remove-ParagraphContaining $ctx.Doc $ctx.Ns 'Startpagina -> Ritvoorstel'
  Add-DiagramAfter $ctx '8 Wireframes en navigatie' (Join-Path $diagrams 'wireframes.png') 'Wireframes HitchTracker' 'Figuur 3. Wireframes en navigatieflow voor de passagier.'
  Add-DiagramAfter $ctx 'De onderstaande activiteitbeschrijving' (Join-Path $diagrams 'activity.png') 'Activiteitendiagram HitchTracker' 'Figuur 4. Activiteitendiagram voor starten, volgen en afronden.'
  Remove-ParagraphContaining $ctx.Doc $ctx.Ns 'Concept -> Gepland -> Bezig -> Afgerond'
  Add-DiagramAfter $ctx '10 3 Statusovergangen' (Join-Path $diagrams 'statusFlow.png') 'Statusovergangen HitchTracker' 'Figuur 5. Statusovergangen van een rit.'
  Remove-ParagraphsAfter $ctx.Doc $ctx.Ns 'Bijlage A PlantUML bron'
  Add-DiagramAfter $ctx 'Bijlage A PlantUML bron' (Join-Path $diagrams 'activity.png') 'Bijlage Activiteitendiagram HitchTracker' 'Bijlage C. Grafisch activiteitendiagram.'
  Add-DiagramAfter $ctx 'Bijlage A PlantUML bron' (Join-Path $diagrams 'useCases.png') 'Bijlage Usecasediagram HitchTracker' 'Bijlage B. Grafisch usecasediagram.'
  Add-DiagramAfter $ctx 'Bijlage A PlantUML bron' (Join-Path $diagrams 'classDiagram.png') 'Bijlage Klassendiagram HitchTracker' 'Bijlage A. Grafisch klassendiagram.'
}

Write-Host 'Inserted real diagram images into both DOCX files.'
